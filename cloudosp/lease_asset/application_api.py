import json

import frappe
from frappe import _
from frappe.utils import cint, flt


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


@frappe.whitelist()
def get_application_options():
	"""直录表单的下拉数据"""
	customers = frappe.get_all(
		"Customer", fields=["name", "customer_name"], order_by="customer_name asc", limit_page_length=500
	)
	pools = frappe.get_all(
		"Resource Pool",
		fields=["name", "pool_name", "pool_type", "architecture", "region"],
		order_by="pool_name asc",
		limit_page_length=200,
	)
	products = frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "category", "uom", "list_price"],
		order_by="product_name asc",
		limit_page_length=200,
	)
	for product in products:
		product["dimensions"] = frappe.get_all(
			"Lease Product Spec",
			filters={"parent": product.name},
			fields=["spec_name", "dimension", "quantity", "uom"],
			order_by="idx asc",
		)

	tenant_users = frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "Website User"},
		fields=["name", "full_name"],
		order_by="name asc",
		limit_page_length=200,
	)

	return {"customers": customers, "pools": pools, "products": products, "tenant_users": tenant_users}


def _collect_items(items):
	if isinstance(items, str):
		items = json.loads(items)

	rows = []
	for row in items or []:
		row = frappe._dict(row)
		if not row.product:
			continue
		rows.append(
			{
				"product": row.product,
				"quantity": flt(row.quantity) or 1,
				"lease_months": cint(row.lease_months) or 1,
			}
		)
	return rows


@frappe.whitelist()
def create_application(customer):
	"""生成一张草稿申请单"""
	if not customer:
		frappe.throw(_("请先选择客户"))

	doc = frappe.new_doc("Lease Application")
	doc.customer = customer
	doc.status = "草稿"
	doc.save(ignore_permissions=True)
	return {"name": doc.name, "customer": doc.customer}


@frappe.whitelist()
def save_application(values):
	"""更新草稿申请单的资源池 / 明细 / 交付信息 / 租户用户"""
	values = _as_dict(values)
	name = values.get("name")
	if not name or not frappe.db.exists("Lease Application", name):
		frappe.throw(_("申请单不存在"))

	doc = frappe.get_doc("Lease Application", name)
	if doc.status not in ("草稿", "已提交"):
		frappe.throw(_("已交付或已取消的申请单不可修改"))

	for key in ("resource_pool", "tenant_user", "delivery_ip", "login_account", "remarks"):
		if values.get(key) is not None and doc.meta.has_field(key):
			doc.set(key, values.get(key))

	if values.get("login_password"):
		doc.login_password = values.get("login_password")

	doc.set("items", [])
	for row in _collect_items(values.get("items")):
		doc.append("items", row)

	doc.save(ignore_permissions=True)

	return {
		"name": doc.name,
		"status": doc.status,
		"item_count": len(doc.items),
		"items": [
			{"product": row.product, "product_name": row.product_name, "quantity": row.quantity} for row in doc.items
		],
	}


@frappe.whitelist()
def complete_and_push(name):
	"""完成申请单并推送到租户用户"""
	if not name or not frappe.db.exists("Lease Application", name):
		frappe.throw(_("申请单不存在"))

	doc = frappe.get_doc("Lease Application", name)
	if doc.status == "已交付":
		frappe.throw(_("该申请单已交付"))

	result = doc.complete_and_push()
	return {
		"name": doc.name,
		"status": doc.status,
		"delivered_at": str(doc.delivered_at),
		"pushed": result.get("pushed", []),
		"delivery": result.get("delivery", {}),
	}
