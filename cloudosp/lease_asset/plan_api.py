import json

import frappe
from frappe import _
from frappe.utils import cint, flt

DIMENSION_KEYS = ("cpu", "memory", "storage")
DIMENSION_LABEL = {"CPU": "cpu", "内存": "memory", "存储": "storage"}


def get_product_dimensions(product):
	"""按规格字典的资源维度与换算系数，算出单个产品的 CPU(核)/内存(GB)/存储(TB)"""
	dims = {key: 0 for key in DIMENSION_KEYS}
	if not product:
		return dims

	for row in frappe.get_all("Lease Product Spec", filters={"parent": product}, fields=["spec", "quantity"]):
		if not row.spec:
			continue
		spec = frappe.db.get_value("Lease Spec", row.spec, ["dimension", "canonical_factor"], as_dict=True)
		if not spec:
			continue
		key = DIMENSION_LABEL.get(spec.dimension)
		if key:
			dims[key] += flt(row.quantity) * (flt(spec.canonical_factor) or 1)

	return dims


def get_product_capacity_by_pool(product, quantity=1):
	"""产品按资源池拆分的容量需求：{pool: {cpu, memory, storage}}

	容量 = 规格行数量 × 规格字典换算系数 × 订购数量；未指定资源池时归入 None（未分配）
	"""
	result = {}
	quantity = flt(quantity) or 1

	for row in frappe.get_all(
		"Lease Product Spec",
		filters={"parent": product},
		fields=["spec", "quantity", "resource_pool"],
	):
		if not row.spec:
			continue
		spec = frappe.db.get_value("Lease Spec", row.spec, ["dimension", "canonical_factor"], as_dict=True)
		if not spec:
			continue
		key = DIMENSION_LABEL.get(spec.dimension)
		if not key:
			continue

		bucket = result.setdefault(row.resource_pool or None, {key: 0 for key in DIMENSION_KEYS})
		bucket[key] += flt(row.quantity) * (flt(spec.canonical_factor) or 1) * quantity

	return result


def _is_admin():
	return frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()


@frappe.whitelist()
def get_plan_options():
	"""页面下拉：产品（含单位资源量）与区域"""
	products = []
	for row in frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "uom", "list_price"],
		order_by="product_name asc",
		limit_page_length=200,
	):
		dims = get_product_dimensions(row.name)
		row["dimensions"] = dims
		products.append(row)

	regions = frappe.get_all(
		"Region",
		fields=["name", "region_name", "network_zone", "data_center"],
		order_by="region_name asc",
		limit_page_length=200,
	)
	for region in regions:
		region["label"] = region.region_name
		region["data_center_name"] = (
			frappe.db.get_value("Data Center", region.data_center, "data_center_name") if region.data_center else ""
		)

	if _is_admin():
		customers = frappe.get_all(
			"Customer", fields=["name", "customer_name"], order_by="customer_name asc", limit_page_length=500
		)
	else:
		from cloudosp.lease_asset.api import get_portal_customer

		customer, _is_manager = get_portal_customer()
		customers = (
			[{"name": customer, "customer_name": frappe.db.get_value("Customer", customer, "customer_name")}]
			if customer
			else []
		)

	return {"products": products, "regions": regions, "customers": customers}


def _plan_filters(only_mine=True):
	filters = {}
	if only_mine and not _is_admin():
		filters["requested_by"] = frappe.session.user
	return filters


@frappe.whitelist()
def get_plan_orders(only_mine=None):
	"""计划/预订单列表；管理员看全部，普通用户只看自己提交的"""
	filters = _plan_filters(cint(only_mine) if only_mine is not None else True)
	orders = frappe.get_all(
		"Lease Plan Order",
		filters=filters,
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
		limit_page_length=100,
	)

	for order in orders:
		order["customer_name"] = (
			frappe.db.get_value("Customer", order.customer, "customer_name") if order.customer else ""
		)
		order["item_count"] = frappe.db.count("Lease Plan Order Item", {"parent": order.name})
		order["summary"] = [
			{
				"region": row.region,
				"region_name": frappe.db.get_value("Region", row.region, "region_name") if row.region else "",
				"cpu_total": flt(row.cpu_total),
				"memory_total": flt(row.memory_total),
				"storage_total": flt(row.storage_total),
			}
			for row in frappe.get_all(
				"Lease Plan Order Summary",
				filters={"parent": order.name},
				fields=["region", "cpu_total", "memory_total", "storage_total"],
			)
		]

	return orders


@frappe.whitelist()
def save_plan_order(values, submit=None):
	"""保存计划/预订单：不做库存与配额校验"""
	if isinstance(values, str):
		values = json.loads(values)
	values = frappe._dict(values or {})

	name = values.get("name")
	doc = (
		frappe.get_doc("Lease Plan Order", name)
		if name and frappe.db.exists("Lease Plan Order", name)
		else frappe.new_doc("Lease Plan Order")
	)

	if not doc.get("name"):
		doc.set("naming_series", "PLAN-.YYYY.-")
		doc.set("requested_by", frappe.session.user)

	items = values.get("items") or []
	if isinstance(items, str):
		items = json.loads(items)

	for key, value in values.items():
		if key in ("name", "doctype", "items", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			doc.set(key, value)

	doc.set("items", [])
	for row in items:
		row = frappe._dict(row)
		doc.append(
			"items",
			{
				"product": row.get("product"),
				"region": row.get("region") or None,
				"quantity": flt(row.get("quantity")) or 1,
				"lease_months": cint(row.get("lease_months")) or 1,
			},
		)

	if not doc.items:
		frappe.throw(_("请至少添加一条产品明细"))

	if cint(submit) and not _is_admin():
		doc.status = "已提交"

	doc.flags.ignore_permissions = True
	doc.save()

	return {
		"name": doc.name,
		"plan_type": doc.plan_type,
		"cpu_total": doc.cpu_total,
		"memory_total": doc.memory_total,
		"storage_total": doc.storage_total,
	}


@frappe.whitelist()
def delete_plan_order(name):
	doc = frappe.get_doc("Lease Plan Order", name)
	if not _is_admin() and doc.requested_by != frappe.session.user:
		frappe.throw(_("无权删除他人提交的计划/预订单"), frappe.PermissionError)

	frappe.delete_doc("Lease Plan Order", name, ignore_permissions=True, force=True)
	return {"name": name, "deleted": True}
