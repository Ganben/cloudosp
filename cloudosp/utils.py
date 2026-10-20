import frappe
from frappe import _

PORTAL_ROUTE = "/lease_asset_portal"


def update_website_context(context):
	"""把租赁资产前台挂到网站导航栏（仅登录用户可见）"""
	if frappe.session.user == "Guest":
		return

	items = list(context.get("top_bar_items") or [])
	if any(item.get("url") == PORTAL_ROUTE for item in items):
		return

	items.append(
		frappe._dict(
			{
				"label": _("租赁资产前台"),
				"url": PORTAL_ROUTE,
				"right": 0,
				"open_in_new_tab": 0,
			}
		)
	)

	return {"top_bar_items": items}
