import frappe


def has_app_permission():
	return True  # 或按角色判断: "System Manager" in frappe.get_roles()
