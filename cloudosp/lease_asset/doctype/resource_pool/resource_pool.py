# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ResourcePool(Document):
	def validate(self):
		if self.total_capacity and self.used_capacity and self.used_capacity > self.total_capacity:
			frappe.throw("已用容量不能大于总容量")
