import json

import frappe
from frappe import _
from frappe.utils import cint, flt


def get_portal_customer(user=None):
	"""返回 (customer, is_admin)

	is_admin=True 表示可查看/创建所有客户的订单；
	否则返回该网站用户关联的客户（Portal User -> Contact -> Customer）。
	"""
	user = user or frappe.session.user

	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return None, True

	customer = None
	for contact in frappe.get_all("Portal User", filters={"user": user}, pluck="parent"):
		customer = frappe.db.get_value(
			"Dynamic Link",
			{"parenttype": "Contact", "parent": contact, "link_doctype": "Customer"},
			"link_name",
		)
		if customer:
			break

	if not customer:
		customer = frappe.db.get_value("Customer", {"email_id": user}, "name")

	return customer, False


def load_lease_orders(customer=None):
	filters = {}
	if customer:
		filters["customer"] = customer

	orders = frappe.get_all(
		"Lease Order",
		filters=filters,
		fields=["name", "customer", "order_date", "start_date", "end_date", "status", "total_amount"],
		order_by="creation desc",
		limit_page_length=50,
	)

	for order in orders:
		order["customer_name"] = frappe.db.get_value("Customer", order.customer, "customer_name")
		order["item_count"] = frappe.db.count("Lease Order Item", {"parent": order.name})

	return orders


def get_stock_summary(product):
	"""产品在全部资源池上的库存合计"""
	rows = frappe.get_all(
		"Lease Product Stock",
		filters={"product": product},
		fields=["resource_pool", "available_qty", "total_qty"],
	)
	available = sum(flt(row.available_qty) for row in rows)
	return {
		"available": available,
		"pools": [{"pool": row.resource_pool, "available": flt(row.available_qty)} for row in rows],
	}


def get_used_qty(user, product):
	"""用户在该产品上已下单数量（不含已取消）"""
	return (
		flt(
			frappe.db.sql(
				"""
				select sum(item.quantity)
				from `tabLease Order Item` item
				join `tabLease Order` orders on orders.name = item.parent
				where orders.owner = %s
					and item.product = %s
					and orders.status != '已取消'
				""",
				(user, product),
			)[0][0]
		)
		or 0
	)


def get_quota_summary(user, product):
	"""用户的该产品配额；未配置配额时返回 None 表示不限"""
	quota_qty = frappe.db.get_value("Lease Product Quota", {"user": user, "product": product}, "quota_qty")
	if quota_qty is None:
		return None

	used = get_used_qty(user, product)
	return {"quota": flt(quota_qty), "used": used, "remaining": flt(quota_qty) - used}


def get_product_pool_options():
	"""官网产品筛选：出现过的资源池"""
	pools = {}
	for row in frappe.get_all(
		"Lease Product Spec", filters={"resource_pool": ("is", "set")}, fields=["resource_pool"]
	):
		pools[row.resource_pool] = frappe.db.get_value("Resource Pool", row.resource_pool, "pool_name")

	return [{"name": name, "label": label or name} for name, label in sorted(pools.items(), key=lambda x: x[1])]


def load_product_catalog(user=None, resource_pool=None):
	user = user or frappe.session.user
	catalog = []

	for row in frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "category", "uom", "list_price"],
		order_by="product_name asc",
		limit_page_length=200,
	):
		spec_rows = frappe.get_all(
			"Lease Product Spec",
			filters={"parent": row.name},
			fields=["spec_name", "dimension", "quantity", "uom", "resource_pool", "capacity_value", "capacity_unit"],
			order_by="idx asc",
		)
		if resource_pool and not any(spec.resource_pool == resource_pool for spec in spec_rows):
			continue

		stock = get_stock_summary(row.name)
		quota = get_quota_summary(user, row.name)
		row["spec_summary"] = spec_rows
		row["stock_available"] = stock["available"]
		row["stock_pools"] = stock["pools"]
		row["quota"] = quota
		catalog.append(row)

	return catalog


def collect_limit_issues(user, items):
	"""库存不足 / 配额超限的提示（不阻断提交）"""
	issues = []
	demand = {}

	for row in items:
		demand[row.get("product")] = demand.get(row.get("product"), 0) + flt(row.get("quantity"))

	for product, qty in demand.items():
		if not product:
			continue

		product_name = frappe.db.get_value("Lease Product", product, "product_name") or product
		available = get_stock_summary(product)["available"]
		if qty > available:
			issues.append(f"{product_name}：库存不足，可用 {available}，本次下单 {qty}")

		quota = get_quota_summary(user, product)
		if quota and qty > quota["remaining"]:
			issues.append(
				f"{product_name}：超出配额，剩余额度 {quota['remaining']}（配额 {quota['quota']}，已用 {quota['used']}），本次下单 {qty}"
			)

	return issues


@frappe.whitelist(allow_guest=True)
def get_product_catalog(resource_pool=None):
	catalog = load_product_catalog(resource_pool=resource_pool)
	for row in catalog:
		row["spec_summary"] = [
			f"{spec.spec_name}{spec.capacity_value or spec.quantity}{spec.capacity_unit or spec.uom or ''}"
			if spec.capacity_value
			else f"{spec.spec_name}{spec.quantity}{spec.uom or ''}"
			for spec in row["spec_summary"]
		]
	return catalog


@frappe.whitelist()
def create_lease_order(customer, start_date=None, end_date=None, remarks=None, items=None, confirm=None):
	linked_customer, is_admin = get_portal_customer()

	if not is_admin:
		if not linked_customer:
			frappe.throw(_("当前账号未关联客户，无法创建订单"), frappe.PermissionError)
		if linked_customer != customer:
			frappe.throw(_("无权为该客户创建订单"), frappe.PermissionError)

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("请至少添加一条租赁产品明细"))

	issues = collect_limit_issues(frappe.session.user, items)
	if issues and not cint(confirm):
		return {"confirm_required": True, "issues": issues}

	doc = frappe.new_doc("Lease Order")
	doc.customer = customer
	doc.start_date = start_date
	doc.end_date = end_date
	doc.remarks = remarks

	for row in items:
		doc.append(
			"items",
			{
				"product": row.get("product"),
				"quantity": flt(row.get("quantity")) or 1,
				"lease_months": cint(row.get("lease_months")) or 1,
			},
		)

	doc.insert(ignore_permissions=True)

	return {"name": doc.name, "total_amount": doc.total_amount, "issues": issues}
