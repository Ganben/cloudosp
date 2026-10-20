import json

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

from cloudosp.lease_asset.plan_api import get_product_dimensions


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


def _linked_assets():
	"""已经录入过（挂到租赁资产 / 作业 / 接收单）的资产，用于排除"""
	names = set()

	for row in frappe.get_all("Lease Asset", filters={"asset": ("is", "set")}, fields=["asset"]):
		names.add(row.asset)
	for row in frappe.get_all("Lease Asset Job", filters={"asset": ("is", "set")}, fields=["asset"]):
		names.add(row.asset)
	for row in frappe.get_all("Lease Asset Receipt Item", filters={"asset": ("is", "set")}, fields=["asset"]):
		names.add(row.asset)

	return names


@frappe.whitelist()
def get_receipt_options():
	"""资源池与可选的扩容补货单"""
	pools = frappe.get_all(
		"Resource Pool",
		fields=["name", "pool_name", "pool_type", "architecture", "region", "data_center"],
		order_by="pool_name asc",
	)

	orders = frappe.get_all(
		"Lease Replenish Order",
		filters={"status": ("not in", ["已完成", "已取消"])},
		fields=["name", "replenish_type", "resource_pool", "region", "status", "cpu_add", "memory_add", "storage_add"],
		order_by="creation desc",
	)

	for order in orders:
		order["pool_name"] = frappe.db.get_value("Resource Pool", order.resource_pool, "pool_name")

	products = []
	for row in frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "uom"],
		order_by="product_name asc",
		limit_page_length=200,
	):
		row["dimensions"] = get_product_dimensions(row.name)
		products.append(row)

	return {"pools": pools, "replenish_orders": orders, "products": products}


@frappe.whitelist()
def discover_assets(tag=None, keyword=None, limit=None):
	"""外部事实账中“尚未录入”的资产：按标签 / 关键字过滤"""
	rows = frappe.get_all(
		"Asset",
		filters={"docstatus": ("!=", 2)},
		fields=["name", "asset_name", "asset_category", "location", "status", "company", "purchase_date"],
		order_by="creation desc",
		limit_page_length=cint(limit) or 200,
	)

	linked = _linked_assets()
	tag = (tag or "").strip().lower()
	keyword = (keyword or "").strip().lower()

	result = []
	for row in rows:
		if row.name in linked:
			continue
		if tag and tag not in (row.asset_category or "").lower() and tag not in (row.location or "").lower():
			continue
		if keyword:
			haystack = " ".join([row.name or "", row.asset_name or "", row.asset_category or "", row.location or ""])
			if keyword not in haystack.lower():
				continue
		row["serial_no"] = frappe.db.get_value("Serial No", {"asset": row.name}, "name") or ""
		row["tag"] = row.asset_category or row.location or ""
		result.append(row)

	return result


@frappe.whitelist()
def get_replenish_capacity(replenish_order):
	"""从关联的扩容补货单带入容量条目"""
	if not replenish_order or not frappe.db.exists("Lease Replenish Order", replenish_order):
		return []

	row = frappe.db.get_values(
		"Lease Replenish Order",
		replenish_order,
		["cpu_add", "memory_add", "storage_add", "replenish_type", "machine_count"],
		as_dict=True,
	)[0]

	entries = []
	for dimension, value in (("CPU", row.cpu_add), ("内存", row.memory_add), ("存储", row.storage_add)):
		if flt(value):
			entries.append({"entry_type": "容量", "dimension": dimension, "capacity_qty": flt(value)})

	if row.replenish_type == "资产新增" and cint(row.machine_count):
		entries.append(
			{"entry_type": "物料", "quantity": cint(row.machine_count), "note": "来自资产新增单的台数"}
		)

	return entries


@frappe.whitelist()
def save_receipt(values, complete=None):
	values = _as_dict(values)
	name = values.get("name")
	doc = (
		frappe.get_doc("Lease Asset Receipt", name)
		if name and frappe.db.exists("Lease Asset Receipt", name)
		else frappe.new_doc("Lease Asset Receipt")
	)

	if not doc.get("name"):
		doc.naming_series = "RECV-.YYYY.-"

	items = values.get("items") or []
	if isinstance(items, str):
		items = json.loads(items)

	capacity_items = values.get("capacity_items") or []
	if isinstance(capacity_items, str):
		capacity_items = json.loads(capacity_items)

	for key, value in values.items():
		if key in ("name", "doctype", "items", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			if key in ("total_cost", "capital_cost", "expense_cost"):
				value = flt(value)
			doc.set(key, value)

	doc.set("items", [])
	for row in items:
		row = frappe._dict(row)
		doc.append(
			"items",
			{
				"serial_no": row.get("serial_no"),
				"asset": row.get("asset") or None,
				"tag": row.get("tag"),
				"source": row.get("source") or "手工录入",
				"note": row.get("note"),
			},
		)

	doc.set("capacity_items", [])
	for row in capacity_items:
		row = frappe._dict(row)
		doc.append(
			"capacity_items",
			{
				"entry_type": row.get("entry_type") or "容量",
				"dimension": row.get("dimension"),
				"capacity_qty": flt(row.get("capacity_qty")),
				"product": row.get("product") or None,
				"quantity": flt(row.get("quantity")),
				"note": row.get("note"),
			},
		)

	doc.save(ignore_permissions=True)

	summary = None
	if cint(complete):
		doc.status = "已接收"
		doc.save(ignore_permissions=True)
		summary = doc.on_submit_complete()

	pool = frappe.db.get_values(
		"Resource Pool",
		doc.resource_pool,
		["cpu_total", "memory_total", "storage_total"],
		as_dict=True,
	)

	return {
		"name": doc.name,
		"status": doc.status,
		"item_count": len(doc.items),
		"capacity_count": len(doc.capacity_items),
		"total_cost": doc.total_cost,
		"replenish_order": doc.replenish_order,
		"capacity_added": summary["added"] if summary else None,
		"materials_received": summary["materials"] if summary else None,
		"pool_capacity": pool[0] if pool else None,
	}


@frappe.whitelist()
def get_receipts(limit=None):
	rows = frappe.get_all(
		"Lease Asset Receipt",
		fields=["name", "resource_pool", "replenish_order", "receipt_date", "status", "total_cost",
				"capital_cost", "expense_cost", "creation"],
		order_by="creation desc",
		limit_page_length=cint(limit) or 50,
	)

	for row in rows:
		row["pool_name"] = frappe.db.get_value("Resource Pool", row.resource_pool, "pool_name")
		row["item_count"] = frappe.db.count("Lease Asset Receipt Item", {"parent": row.name})

	return rows
