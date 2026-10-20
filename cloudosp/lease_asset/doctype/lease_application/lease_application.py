# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime
from frappe.utils.password import get_decrypted_password


class LeaseApplication(Document):
	def validate(self):
		self.validate_items()

	def validate_items(self):
		# 草稿允许暂无明细；完成交付时由 complete_and_push 强制校验
		for row in self.items:
			if not flt(row.quantity):
				frappe.throw(f"产品明细第 {row.idx} 行：请填写数量")

	def validate_delivery(self):
		if not self.resource_pool:
			frappe.throw("请填写资源池")
		for field, label in (
			("delivery_ip", "交付 IP"),
			("login_account", "登录账户"),
			("login_password", "登录密码"),
		):
			if not self.get(field):
				frappe.throw(f"请填写{label}")

	def complete_and_push(self):
		"""完成申请单并推送到租户用户"""
		self.validate_delivery()
		if not self.items:
			frappe.throw("请至少填写一条产品明细")
		self.validate_items()

		self.status = "已交付"
		self.delivered_at = now_datetime()
		self.save(ignore_permissions=True)

		result = {"pushed": []}
		if self.tenant_user:
			password = ""
			try:
				password = get_decrypted_password(
					"Lease Application", self.name, "login_password", raise_exception=False
				)
			except Exception:
				password = ""

			subject = f"租赁申请 {self.name} 已交付"
			content = (
				f"您的租赁申请 {self.name} 已交付。\n"
				f"交付 IP：{self.delivery_ip}\n"
				f"登录账户：{self.login_account}\n"
				f"登录密码：{password}"
			)

			notification = frappe.new_doc("Notification Log")
			notification.for_user = self.tenant_user
			notification.from_user = frappe.session.user
			notification.subject = subject
			notification.email_content = content
			notification.document_type = "Lease Application"
			notification.document_name = self.name
			notification.insert(ignore_permissions=True)
			result["pushed"].append("站内通知")

			try:
				frappe.sendmail(recipients=[self.tenant_user], subject=subject, message=content.replace("\n", "<br>"))
				result["pushed"].append("邮件")
			except Exception:
				frappe.log_error(title="租赁申请推送邮件失败", message=frappe.get_traceback())

		result["delivery"] = {
			"delivery_ip": self.delivery_ip,
			"login_account": self.login_account,
			"login_password": password,
		}
		return result
