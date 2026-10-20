import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from cloudosp.lease_asset.plan_api import get_product_dimensions


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


@frappe.whitelist()
def get_request_options():
	"""订单、产品（含规格）、资源池（含当前读数）"""
	orders = frappe.get_all(
		"Lease Order",
		filters={"docstatus": ("!=", 2)},
		fields=["name", "customer", "order_date", "status", "total_amount", "creation"],
		order_by="creation desc",
		limit_page_length=200,
	)
	for order in orders:
		order["customer_name"] = (
			frappe.db.get_value("Customer", order.customer, "customer_name") if order.customer else ""
		)
		order["items"] = frappe.get_all(
			"Lease Order Item",
			filters={"parent": order.name},
			fields=["product", "product_name", "quantity", "lease_months"],
			order_by="idx asc",
		)

	products = frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "category", "uom", "list_price"],
		order_by="product_name asc",
		limit_page_length=200,
	)
	for product in products:
		product["specs"] = get_product_spec_rows(product.name)
		product["dimensions"] = get_product_dimensions(product.name)

	pools = frappe.get_all(
		"Resource Pool",
		fields=["name", "pool_name", "pool_type", "architecture", "region", "cpu_total", "cpu_used",
				"memory_total", "memory_used", "storage_total", "storage_used", "status"],
		order_by="pool_name asc",
		limit_page_length=200,
	)
	for pool in pools:
		pool["label"] = pool.pool_name

	return {"orders": orders, "products": products, "pools": pools}


def get_product_spec_rows(product):
	rows = frappe.get_all(
		"Lease Product Spec",
		filters={"parent": product},
		fields=["spec", "spec_name", "dimension", "uom", "quantity", "capacity_value", "capacity_unit", "resource_pool"],
		order_by="idx asc",
	)
	for row in rows:
		row["unit"] = row.capacity_unit or row.uom
		row["planned_value"] = row.capacity_value if row.capacity_value is not None else row.quantity
	return rows


@frappe.whitelist()
def get_delivery_template(products):
	"""按所选产品生成待录入的交付信息行（取自产品规格定义）"""
	if isinstance(products, str):
		products = json.loads(products)

	rows = []
	for product in products or []:
		product = frappe._dict(product)
		if not product.product:
			continue
		for spec in get_product_spec_rows(product.product):
			rows.append(
				{
					"product": product.product,
					"product_name": frappe.db.get_value("Lease Product", product.product, "product_name"),
					"spec": spec.spec,
					"spec_name": spec.spec_name,
					"dimension": spec.dimension,
					"unit": spec.unit,
					"planned_value": spec.planned_value,
					"delivered_value": spec.planned_value,
				}
			)

	return rows


@frappe.whitelist()
def save_request(values, complete=None):
	values = _as_dict(values)
	name = values.get("name")
	doc = (
		frappe.get_doc("Lease Request Process", name)
		if name and frappe.db.exists("Lease Request Process", name)
		else frappe.new_doc("Lease Request Process")
	)

	if not doc.get("name"):
		doc.naming_series = "REQ-.YYYY.-"

	def collect(key):
		rows = values.get(key) or []
		if isinstance(rows, str):
			rows = json.loads(rows)
		return rows

	for key, value in values.items():
		if key in (
			"name",
			"doctype",
			"products",
			"delivery_items",
			"tags",
			"readings",
			"owner",
			"creation",
			"modified",
			"modified_by",
		):
			continue
		if doc.meta.has_field(key):
			if key in ("cpu_deduct", "memory_deduct", "storage_deduct"):
				value = flt(value)
			doc.set(key, value)

	doc.set("products", [])
	for row in collect("products"):
		row = frappe._dict(row)
		if not row.product:
			continue
		doc.append("products", {"product": row.product, "quantity": flt(row.quantity) or 1})

	doc.set("delivery_items", [])
	for row in collect("delivery_items"):
		row = frappe._dict(row)
		doc.append(
			"delivery_items",
			{
				"product": row.product,
				"spec": row.spec,
				"spec_name": row.spec_name,
				"dimension": row.dimension,
				"unit": row.unit,
				"planned_value": flt(row.planned_value),
				"delivered_value": flt(row.delivered_value),
				"note": row.note,
			},
		)

	doc.set("tags", [])
	for row in collect("tags"):
		row = frappe._dict(row)
		if not row.tag_key:
			continue
		doc.append("tags", {"tag_key": row.tag_key, "tag_value": row.tag_value})

	doc.set("readings", [])
	for row in collect("readings"):
		row = frappe._dict(row)
		if not row.resource_pool:
			continue
		doc.append(
			"readings",
			{
				"resource_pool": row.resource_pool,
				"cpu_used": flt(row.cpu_used),
				"memory_used": flt(row.memory_used),
				"storage_used": flt(row.storage_used),
				"status": row.status,
			},
		)

	doc.save(ignore_permissions=True)

	result = None
	if cint(complete):
		doc.status = "已完成"
		doc.save(ignore_permissions=True)
		result = doc.on_complete()

	return {
		"name": doc.name,
		"status": doc.status,
		"product_count": len(doc.products),
		"delivery_count": len(doc.delivery_items),
		"tag_count": len(doc.tags),
		"reading_count": len(doc.readings),
		"result": result,
	}
