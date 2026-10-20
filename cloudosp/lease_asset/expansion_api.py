import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from .plan_api import DIMENSION_KEYS, DIMENSION_LABEL, get_product_dimensions

DIMENSION_META = {"cpu": (_("CPU"), _("核")), "memory": (_("内存"), _("GB")), "storage": (_("存储"), _("TB"))}


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


def _empty_dims():
	return {key: 0 for key in DIMENSION_KEYS}


def _label(pool):
	return frappe.db.get_value("Resource Pool", pool, "pool_name") if pool else ""


@frappe.whitelist()
def get_expansion_options():
	"""向导下拉：层级节点、资源池、产品"""
	return {
		"data_centers": frappe.get_all(
			"Data Center", fields=["name", "data_center_name", "city"], order_by="data_center_name asc"
		),
		"zones": frappe.get_all(
			"Network Zone",
			fields=["name", "zone_name", "data_center", "zone_type"],
			order_by="zone_name asc",
		),
		"regions": frappe.get_all(
			"Region", fields=["name", "region_name", "network_zone", "data_center"], order_by="region_name asc"
		),
		"pools": frappe.get_all(
			"Resource Pool",
			fields=["name", "pool_name", "pool_type", "architecture", "region", "cpu_total", "cpu_used",
					"memory_total", "memory_used", "storage_total", "storage_used"],
			order_by="pool_name asc",
		),
		"products": frappe.get_all(
			"Lease Product",
			filters={"status": "在用"},
			fields=["name", "product_code", "product_name", "uom"],
			order_by="product_name asc",
		),
	}


@frappe.whitelist()
def get_material_stock(pool=None):
	"""可选物料库存：优先本资源池，未指定时给出全部库存"""
	filters = {"resource_pool": pool} if pool else {}
	rows = frappe.get_all(
		"Lease Product Stock",
		filters=filters,
		fields=["name", "product", "product_name", "resource_pool", "total_qty", "used_qty", "available_qty"],
		order_by="product asc",
		limit_page_length=200,
	)

	if not rows and pool:
		rows = frappe.get_all(
			"Lease Product Stock",
			fields=["name", "product", "product_name", "resource_pool", "total_qty", "used_qty", "available_qty"],
			order_by="product asc",
			limit_page_length=200,
		)

	for row in rows:
		row["pool_name"] = _label(row.resource_pool)

	return rows


def _demand_by_material(demand):
	"""需求按产品汇总"""
	result = {}
	if demand.get("mode") == "product":
		for row in demand.get("items") or []:
			row = frappe._dict(row)
			if not row.product:
				continue
			result[row.product] = result.get(row.product, 0) + (flt(row.quantity) or 1)
	return result


def _demand_by_dimension(demand):
	"""需求折算为 CPU / 内存 / 存储"""
	dims = _empty_dims()
	if demand.get("mode") == "capacity":
		capacity = frappe._dict(demand.get("capacity") or {})
		for key in DIMENSION_KEYS:
			dims[key] += flt(capacity.get(key))
		return dims

	for product, quantity in _demand_by_material(demand).items():
		for key, value in get_product_dimensions(product).items():
			dims[key] += value * quantity

	return dims


def _stock_by_dimension(rows):
	dims = _empty_dims()
	for row in rows:
		for key, value in get_product_dimensions(row["product"]).items():
			dims[key] += value * (flt(row["available_qty"]) or 0)
	return dims


@frappe.whitelist()
def compute_material_plan(payload):
	"""扩容物控表：需求 / 库存 / 缺口，按物料与按资源维度分别给出"""
	payload = _as_dict(payload)
	demand = _as_dict(payload.get("demand") or {})
	selected = payload.get("materials") or []

	stock_rows = []
	for row in selected:
		row = frappe._dict(row)
		name = row.get("name") or row.get("stock")
		if not name:
			continue
		row["product"] = row.get("product") or frappe.db.get_value("Lease Product Stock", name, "product")
		row["available_qty"] = row.get("available_qty")
		if row["available_qty"] is None:
			row["available_qty"] = frappe.db.get_value("Lease Product Stock", name, "available_qty")
		row["pool_name"] = _label(row.get("resource_pool"))
		stock_rows.append(row)

	demand_material = _demand_by_material(demand)
	demand_dims = _demand_by_dimension(demand)
	stock_dims = _stock_by_dimension(stock_rows)

	by_material = []
	products = sorted(
		set(list(demand_material.keys()) + [row["product"] for row in stock_rows]),
	)
	for product in products:
		demand_qty = demand_material.get(product, 0)
		stock_qty = sum(
			flt(row["available_qty"]) for row in stock_rows if row["product"] == product
		)
		by_material.append(
			{
				"product": product,
				"product_name": frappe.db.get_value("Lease Product", product, "product_name"),
				"demand_qty": demand_qty,
				"stock_qty": stock_qty,
				"gap_qty": max(demand_qty - stock_qty, 0),
			}
		)

	by_dimension = []
	for key in DIMENSION_KEYS:
		label, unit = DIMENSION_META[key]
		by_dimension.append(
			{
				"key": key,
				"label": label,
				"unit": unit,
				"demand": demand_dims[key],
				"stock": stock_dims[key],
				"gap": max(demand_dims[key] - stock_dims[key], 0),
			}
		)

	return {
		"pool": payload.get("pool"),
		"pool_name": _label(payload.get("pool")),
		"demand_mode": demand.get("mode") or "product",
		"by_material": by_material,
		"by_dimension": by_dimension,
	}


@frappe.whitelist()
def save_expansion_result(payload):
	"""落地：必要时新建资源池，并按缺口生成扩容补货单"""
	payload = _as_dict(payload)
	plan = compute_material_plan(payload)
	created = {}

	new_pool = payload.get("new_pool")
	if new_pool:
		new_pool = _as_dict(new_pool)
		pool = frappe.new_doc("Resource Pool")
		pool.naming_series = "RP-.YYYY.-"
		pool.pool_name = new_pool.get("pool_name")
		pool.pool_type = new_pool.get("pool_type")
		pool.architecture = new_pool.get("architecture")
		pool.region = new_pool.get("region")
		pool.status = new_pool.get("status") or "可用"
		pool.save(ignore_permissions=True)
		created["pool"] = pool.name
		plan["pool"] = pool.name
		plan["pool_name"] = pool.pool_name

	gap = {row["key"]: row["gap"] for row in plan["by_dimension"]}
	created_gap = cint(payload.get("create_replenish"))
	if created_gap and any(gap.values()) and plan.get("pool"):
		replenish = frappe.new_doc("Lease Replenish Order")
		replenish.naming_series = "REPL-.YYYY.-"
		replenish.replenish_type = "扩容"
		replenish.resource_pool = plan["pool"]
		replenish.status = "草稿"
		replenish.cpu_add = gap["cpu"]
		replenish.memory_add = gap["memory"]
		replenish.storage_add = gap["storage"]
		replenish.remarks = payload.get("remarks")
		replenish.save(ignore_permissions=True)
		created["replenish"] = replenish.name

	plan["created"] = created
	return plan
