import frappe
from frappe import _

from cloudosp.lease_asset.api import (
	get_portal_customer,
	get_product_pool_options,
	load_lease_orders,
	load_product_catalog,
)

no_cache = 1


def get_context(context):
	context.title = _("租赁资产前台")
	context.no_cache = 1

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/lease_asset_portal"
		raise frappe.Redirect

	customer, is_admin = get_portal_customer()
	selected_pool = frappe.form_dict.get("pool")

	context.is_admin = is_admin
	context.current_customer = customer
	context.no_permission = not is_admin and not customer
	context.customers = (
		frappe.get_all(
			"Customer", fields=["name", "customer_name"], order_by="customer_name asc", limit_page_length=500
		)
		if is_admin
		else []
	)
	context.products = frappe.get_all(
		"Lease Product",
		filters={"status": "在用"},
		fields=["name", "product_code", "product_name", "uom", "list_price"],
		order_by="product_name asc",
		limit_page_length=500,
	)
	context.lease_orders = load_lease_orders(customer)
	context.pool_options = get_product_pool_options()
	context.selected_pool = selected_pool
	context.product_catalog = load_product_catalog(resource_pool=selected_pool)
