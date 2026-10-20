# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class LeaseProductStock(Document):
	def autoname(self):
		self.name = f"{self.product} - {self.resource_pool}"

	def validate(self):
		self.validate_duplicate()
		self.available_qty = flt(self.total_qty) - flt(self.used_qty)

	def validate_duplicate(self):
		existing = frappe.db.get_value(
			"Lease Product Stock",
			{"product": self.product, "resource_pool": self.resource_pool, "name": ("!=", self.name)},
			"name",
		)
		if existing:
			frappe.throw(f"产品 {self.product} 在资源池 {self.resource_pool} 的库存明细已存在：{existing}")
