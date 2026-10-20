import frappe
from frappe import _


def _manager():
	frappe.only_for("System Manager")


@frappe.whitelist()
def create_issue(page, title, description):
	"""提交一条 Issue（所有登录用户可用）"""
	if frappe.session.user == "Guest":
		frappe.throw(_("请先登录"))

	title = (title or "").strip()
	description = (description or "").strip()
	if not title:
		frappe.throw(_("请填写标题"))
	if not description:
		frappe.throw(_("请填写正文"))

	doc = frappe.new_doc("Lease Issue")
	doc.title = title
	doc.page = (page or "").strip() or None
	doc.description = description
	doc.submitted_by = frappe.session.user
	doc.insert(ignore_permissions=True)

	return {"name": doc.name, "title": doc.title}


@frappe.whitelist()
def get_issues(status=None):
	"""Issue 列表（System Manager）"""
	_manager()

	filters = {}
	if status:
		filters["status"] = status

	rows = frappe.get_all(
		"Lease Issue",
		filters=filters,
		fields=["name", "title", "page", "description", "submitted_by", "submitted_at", "status"],
		order_by="creation desc",
		limit_page_length=200,
	)
	for row in rows:
		row["submitted_by_name"] = (
			frappe.db.get_value("User", row.submitted_by, "full_name") if row.submitted_by else ""
		)
		row["page_title"] = frappe.db.get_value("Page", row.page, "title") if row.page else ""

	return rows


@frappe.whitelist()
def set_status(name, status):
	"""标记处理状态（System Manager）"""
	_manager()
	if status not in ("待处理", "已处理"):
		frappe.throw(_("无效的状态"))

	frappe.db.set_value("Lease Issue", name, "status", status)
	return {"name": name, "status": status}
