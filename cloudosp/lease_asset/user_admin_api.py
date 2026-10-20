import json

import frappe
from frappe import _
from frappe.utils import cint

PROTECTED_USERS = ("Administrator", "Guest")


def _manager():
	"""本页所有接口仅限 System Manager"""
	frappe.only_for("System Manager")


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


def _user_roles(user):
	return frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")


@frappe.whitelist()
def get_users(keyword=None, role=None):
	"""用户列表：可按关键字 / 角色过滤"""
	_manager()

	filters = [["name", "not in", list(PROTECTED_USERS)]]
	or_filters = None
	if keyword:
		keyword = f"%{keyword.strip()}%"
		or_filters = [["name", "like", keyword], ["full_name", "like", keyword]]

	rows = frappe.get_all(
		"User",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "first_name", "last_name", "full_name", "enabled", "user_type", "creation"],
		order_by="name asc",
		limit_page_length=200,
	)

	result = []
	for row in rows:
		roles = _user_roles(row.name)
		if role and role not in roles:
			continue
		row["roles"] = roles
		result.append(row)

	return result


@frappe.whitelist()
def get_roles():
	"""可分配的角色清单"""
	_manager()
	return frappe.get_all(
		"Role",
		filters={"disabled": 0},
		fields=["name", "role_name", "desk_access", "is_custom"],
		order_by="role_name asc",
	)


@frappe.whitelist()
def get_app_pages():
	"""本应用的 Page 及其可访问角色"""
	_manager()
	pages = frappe.get_all(
		"Page", filters={"module": "Lease Asset"}, fields=["name", "title"], order_by="name asc"
	)
	for page in pages:
		page["roles"] = frappe.get_all("Has Role", filters={"parent": page.name, "parenttype": "Page"}, pluck="role")

	return pages


@frappe.whitelist()
def get_user_detail(user):
	_manager()
	doc = frappe.get_doc("User", user)
	return {
		"name": doc.name,
		"full_name": doc.full_name,
		"enabled": doc.enabled,
		"user_type": doc.user_type,
		"roles": _user_roles(doc.name),
	}


@frappe.whitelist()
def create_user(email, first_name, password, roles=None):
	_manager()
	email = (email or "").strip().lower()
	if not email or not first_name:
		frappe.throw(_("邮箱与姓名为必填"))
	if not password or len(password) < 8:
		frappe.throw(_("密码至少 8 位"))
	if frappe.db.exists("User", email):
		frappe.throw(_("用户 {0} 已存在").format(email))

	doc = frappe.new_doc("User")
	doc.email = email
	doc.first_name = first_name.strip()
	doc.user_type = "System User"
	doc.send_welcome_email = 0
	doc.new_password = password

	for role in _as_dict({"roles": roles}).get("roles") or []:
		role = frappe._dict(role) if isinstance(role, dict) else frappe._dict({"role": role})
		if role.role:
			doc.append("roles", {"role": role.role})

	doc.flags.ignore_permissions = True
	doc.insert()

	return {"name": doc.name, "full_name": doc.full_name, "roles": _user_roles(doc.name)}


@frappe.whitelist()
def update_roles(user, roles):
	_manager()
	doc = frappe.get_doc("User", user)

	new_roles = [frappe._dict(r).get("role") if isinstance(r, dict) else r for r in (roles or [])]
	doc.roles = []
	for role in new_roles:
		if role:
			doc.append("roles", {"role": role})

	doc.save(ignore_permissions=True)
	return {"name": doc.name, "roles": _user_roles(doc.name)}


@frappe.whitelist()
def reset_password(user, new_password=None, send_email=None):
	"""管理员重置密码：给新密码直接设置，或发送重置邮件"""
	_manager()
	if user in PROTECTED_USERS:
		frappe.throw(_("该账号不允许在此重置密码"))

	if new_password:
		if len(new_password) < 8:
			frappe.throw(_("密码至少 8 位"))
		doc = frappe.get_doc("User", user)
		doc.new_password = new_password
		doc.flags.ignore_permissions = True
		doc.save()
		return {"name": user, "method": _("直接设置新密码")}

	from frappe.core.doctype.user.user import reset_password as frappe_reset_password

	frappe_reset_password(user)
	return {"name": user, "method": _("已发送重置邮件")}


@frappe.whitelist()
def set_enabled(user, enabled):
	_manager()
	if user in PROTECTED_USERS:
		frappe.throw(_("该账号不允许在此停用"))

	doc = frappe.get_doc("User", user)
	doc.enabled = cint(enabled)
	doc.flags.ignore_permissions = True
	doc.save()

	if not doc.enabled:
		frappe.clear_cache(user=user)

	return {"name": doc.name, "enabled": bool(doc.enabled)}


@frappe.whitelist()
def set_page_roles(page, roles):
	_manager()
	doc = frappe.get_doc("Page", page)

	doc.roles = []
	for role in roles or []:
		role = frappe._dict(role).get("role") if isinstance(role, dict) else role
		if role:
			doc.append("roles", {"role": role})

	doc.flags.ignore_permissions = True
	doc.save()

	return {
		"name": doc.name,
		"roles": frappe.get_all("Has Role", filters={"parent": doc.name, "parenttype": "Page"}, pluck="role"),
	}
