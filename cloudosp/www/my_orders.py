import frappe
from frappe import _

from cloudosp.utils.portal import get_portal_orders, get_user_tenant, is_manager


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/my-orders"
		raise frappe.Redirect

	context.no_cache = 1
	context.title = _("我的订单")
	context.tenant = get_user_tenant()
	context.is_manager = is_manager()
	context.pre_orders = get_portal_orders("Resource Pre-order")
	context.application_orders = get_portal_orders("Resource Application Order")
	context.web_forms = frappe.get_all(
		"Web Form",
		filters={
			"doc_type": ["in", ["Resource Pre-order", "Resource Application Order"]],
			"published": 1,
		},
		fields=["route", "title", "doc_type"],
	)
	context.format_date = frappe.utils.format_date
	return context
