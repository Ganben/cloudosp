# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

from frappe.model.document import Document


class LeaseReplenishOrder(Document):
	def validate(self):
		self.clear_unused_fields()

	def clear_unused_fields(self):
		"""按类型清理不使用的字段，避免统计口径混淆"""
		if self.replenish_type == "资产新增":
			self.cpu_add = 0
			self.memory_add = 0
			self.storage_add = 0
		else:
			self.asset = None
			self.machine_count = 0
