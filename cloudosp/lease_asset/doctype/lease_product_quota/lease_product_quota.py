# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class LeaseProductQuota(Document):
	def autoname(self):
		self.name = f"{self.user} - {self.product}"

	def validate(self):
		self.validate_duplicate()

	def validate_duplicate(self):
		existing = frappe.db.get_value(
			"Lease Product Quota",
			{"user": self.user, "product": self.product, "name": ("!=", self.name)},
			"name",
		)
		if existing:
			frappe.throw(f"用户 {self.user} 与产品 {self.product} 的配额已存在：{existing}")
