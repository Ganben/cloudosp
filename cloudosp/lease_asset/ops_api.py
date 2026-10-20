from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from .plan_api import DIMENSION_KEYS, DIMENSION_LABEL

DEFAULT_PAGE_SIZE = 20


def _paginate(rows, page, page_size):
	page_size = cint(page_size) or DEFAULT_PAGE_SIZE
	page = max(cint(page) or 1, 1)
	start = (page - 1) * page_size
	return {
		"total": len(rows),
		"page": page,
		"page_size": page_size,
		"pages": max((len(rows) + page_size - 1) // page_size, 1) if rows else 1,
		"rows": rows[start : start + page_size],
	}


def _group_count(rows, key):
	grouped = {}
	for row in rows:
		grouped[row.get(key) or _("未分类")] = grouped.get(row.get(key) or _("未分类"), 0) + 1
	return grouped


def _sum(rows, key):
	return sum(flt(row.get(key)) for row in rows)


def _customer_name(customer):
	return frappe.db.get_value("Customer", customer, "customer_name") if customer else ""


def _empty_dims():
	return {key: 0 for key in DIMENSION_KEYS}


@frappe.whitelist()
def get_plan_board(page=None, page_size=None):
	"""计划 / 预定：两组统计卡片 + 分页清单"""
	rows = frappe.get_all(
		"Lease Plan Order",
		fields=[
			"name",
			"plan_type",
			"requested_by",
			"customer",
			"expected_date",
			"status",
			"cpu_total",
			"memory_total",
			"storage_total",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=500,
	)

	for row in rows:
		row["customer_name"] = _customer_name(row.customer)
		row["item_count"] = frappe.db.count("Lease Plan Order Item", {"parent": row.name})

	groups = {}
	for plan_type in ("计划", "预定"):
		subset = [row for row in rows if row.plan_type == plan_type]
		groups[plan_type] = {
			"stats": {
				"total": len(subset),
				"cpu_total": _sum(subset, "cpu_total"),
				"memory_total": _sum(subset, "memory_total"),
				"storage_total": _sum(subset, "storage_total"),
				"by_status": _group_count(subset, "status"),
			},
			"list": _paginate(subset, page, page_size),
		}

	return groups


@frappe.whitelist()
def get_sales_board(page=None, page_size=None):
	"""销售订单：统计卡片 + 分页清单"""
	rows = frappe.get_all(
		"Lease Order",
		filters={"docstatus": ("!=", 2)},
		fields=["name", "customer", "order_date", "start_date", "end_date", "status", "total_amount", "creation"],
		order_by="creation desc",
		limit_page_length=500,
	)

	for row in rows:
		row["customer_name"] = _customer_name(row.customer)
		row["item_count"] = frappe.db.count("Lease Order Item", {"parent": row.name})

	return {
		"stats": {
			"total": len(rows),
			"customers": len({row.customer for row in rows if row.customer}),
			"amount": _sum(rows, "total_amount"),
			"items": sum(row["item_count"] for row in rows),
			"by_status": _group_count(rows, "status"),
		},
		"list": _paginate(rows, page, page_size),
	}


@frappe.whitelist()
def get_replenish_board(page=None, page_size=None):
	"""补货单：统计卡片 + 分页清单"""
	rows = frappe.get_all(
		"Lease Replenish Order",
		fields=[
			"name",
			"replenish_type",
			"resource_pool",
			"region",
			"expected_date",
			"actual_date",
			"status",
			"cpu_add",
			"memory_add",
			"storage_add",
			"machine_count",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=500,
	)

	for row in rows:
		row["pool_name"] = frappe.db.get_value("Resource Pool", row.resource_pool, "pool_name")
		row["region_name"] = frappe.db.get_value("Region", row.region, "region_name") if row.region else ""

	return {
		"stats": {
			"total": len(rows),
			"cpu_add": _sum(rows, "cpu_add"),
			"memory_add": _sum(rows, "memory_add"),
			"storage_add": _sum(rows, "storage_add"),
			"machines": _sum(rows, "machine_count"),
			"by_type": _group_count(rows, "replenish_type"),
			"by_status": _group_count(rows, "status"),
		},
		"list": _paginate(rows, page, page_size),
	}


def _week_start(value):
	date = getdate(value)
	return date - timedelta(days=date.weekday())


def _product_capacity_by_region(product, quantity=1):
	"""产品容量按区域拆分：{region: {cpu, memory, storage}}"""
	result = {}
	for row in frappe.get_all(
		"Lease Product Spec", filters={"parent": product}, fields=["spec", "quantity", "resource_pool"]
	):
		if not row.spec:
			continue
		spec = frappe.db.get_value("Lease Spec", row.spec, ["dimension", "canonical_factor"], as_dict=True)
		if not spec:
			continue
		key = DIMENSION_LABEL.get(spec.dimension)
		if not key:
			continue

		region = frappe.db.get_value("Resource Pool", row.resource_pool, "region") if row.resource_pool else None
		bucket = result.setdefault(region, _empty_dims())
		bucket[key] += flt(row.quantity) * (flt(spec.canonical_factor) or 1) * (flt(quantity) or 1)

	return result


def _bump(store, week, region, dims, machines=0):
	bucket = store.setdefault((week, region), _empty_dims())
	for key in DIMENSION_KEYS:
		bucket[key] += dims.get(key, 0)
	bucket["machines"] = bucket.get("machines", 0) + machines


@frappe.whitelist()
def get_capacity_weekly(weeks=None):
	"""容量变化：按周、按区域汇总（新增来自补货单，消耗来自销售订单）"""
	weeks = cint(weeks) or 8

	added = {}
	for row in frappe.get_all(
		"Lease Replenish Order",
		fields=["replenish_type", "region", "cpu_add", "memory_add", "storage_add", "machine_count",
				"expected_date", "actual_date", "creation"],
	):
		date = row.actual_date or row.expected_date or row.creation
		week = _week_start(date)
		dims = {
			"cpu": flt(row.cpu_add),
			"memory": flt(row.memory_add),
			"storage": flt(row.storage_add),
		}
		machines = flt(row.machine_count) if row.replenish_type == "资产新增" else 0
		_bump(added, week, row.region, dims, machines)

	consumed = {}
	for order in frappe.get_all(
		"Lease Order",
		filters={"docstatus": ("!=", 2)},
		fields=["name", "order_date", "creation"],
		limit_page_length=500,
	):
		date = order.order_date or order.creation
		week = _week_start(date)
		for item in frappe.get_all(
			"Lease Order Item", filters={"parent": order.name}, fields=["product", "quantity"]
		):
			for region, dims in _product_capacity_by_region(item.product, item.quantity).items():
				_bump(consumed, week, region, dims)

	keys = sorted(set(added) | set(consumed), key=lambda k: (k[0], k[1] or ""), reverse=True)
	keys = keys[: max(weeks * 10, 10)]

	rows = []
	for week, region in keys:
		add = added.get((week, region), _empty_dims())
		use = consumed.get((week, region), _empty_dims())
		rows.append(
			{
				"week_start": str(week),
				"week_label": f"{week} ~ {week + timedelta(days=6)}",
				"region": region,
				"region_name": frappe.db.get_value("Region", region, "region_name") if region else "",
				"cpu_added": add.get("cpu", 0),
				"memory_added": add.get("memory", 0),
				"storage_added": add.get("storage", 0),
				"machines_added": add.get("machines", 0),
				"cpu_consumed": use.get("cpu", 0),
				"memory_consumed": use.get("memory", 0),
				"storage_consumed": use.get("storage", 0),
				"cpu_net": add.get("cpu", 0) - use.get("cpu", 0),
				"memory_net": add.get("memory", 0) - use.get("memory", 0),
				"storage_net": add.get("storage", 0) - use.get("storage", 0),
			}
		)

	return {
		"stats": {
			"weeks": len({row["week_start"] for row in rows}),
			"regions": len({row["region"] for row in rows if row["region"]}),
			"cpu_added": sum(row["cpu_added"] for row in rows),
			"cpu_consumed": sum(row["cpu_consumed"] for row in rows),
			"machines_added": sum(row["machines_added"] for row in rows),
		},
		"rows": rows,
	}
