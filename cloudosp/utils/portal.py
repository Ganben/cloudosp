"""门户（Portal）访问控制：租户身份识别、订单可见范围与下单提交。"""

from __future__ import annotations

import frappe
from frappe import _

PORTAL_ORDER_DOCTYPES = ("Resource Application Order", "Resource Pre-order")


def is_manager(user: str | None = None) -> bool:
	user = user or frappe.session.user
	return user == "Administrator" or "System Manager" in frappe.get_roles(user)


def get_user_tenant(user: str | None = None) -> str | None:
	"""按登录用户邮箱匹配租户；未匹配返回 None。"""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return None
	tenant = frappe.db.get_value(
		"Tenant", {"contact_email": user, "enabled": 1}, "name"
	)
	return tenant


def _tenant_condition(doctype: str, user: str | None = None) -> str:
	if is_manager(user):
		return ""
	tenant = get_user_tenant(user)
	if not tenant:
		return "1=0"
	return f"`tab{doctype}`.`tenant` = {frappe.db.escape(tenant)}"


def application_order_query_conditions(user: str | None = None) -> str:
	return _tenant_condition("Resource Application Order", user)


def pre_order_query_conditions(user: str | None = None) -> str:
	return _tenant_condition("Resource Pre-order", user)


def order_has_permission(doc, ptype: str | None = None, user: str | None = None) -> bool:
	if is_manager(user):
		return True
	return bool(user or frappe.session.user) and doc.tenant == get_user_tenant(user)


@frappe.whitelist()
def submit_order(doctype: str, name: str) -> str:
	"""门户下单：提交草稿订单（申请订单在此触发库存校验）。"""
	if doctype not in PORTAL_ORDER_DOCTYPES:
		frappe.throw(_("不支持的单据类型"), frappe.PermissionError)
	doc = frappe.get_doc(doctype, name)
	if not is_manager() and doc.tenant != get_user_tenant():
		frappe.throw(_("无权操作该单据"), frappe.PermissionError)
	if doc.docstatus != 0:
		frappe.throw(_("单据当前状态不允许提交"))
	doc.submit()
	return doc.name


def get_portal_orders(doctype: str) -> list[dict]:
	"""门户「我的订单」列表数据。"""
	if doctype not in PORTAL_ORDER_DOCTYPES:
		return []
	filters = {} if is_manager() else {"tenant": get_user_tenant() or "__none__"}
	fields = ["name", "tenant", "order_date", "status", "docstatus"]
	if doctype == "Resource Pre-order":
		fields.append("expected_date")
	return frappe.get_all(
		doctype,
		filters=filters,
		fields=fields,
		order_by="creation desc",
		limit_page_length=50,
	)
