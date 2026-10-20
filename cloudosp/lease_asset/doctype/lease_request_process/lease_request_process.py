# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, nowdate


class LeaseRequestProcess(Document):
	def validate(self):
		self.validate_order()

	def validate_order(self):
		if self.lease_order and not frappe.db.exists("Lease Order", self.lease_order):
			frappe.throw(f"租赁订单 {self.lease_order} 不存在")

	def apply_readings(self):
		"""把资源池状态读数写回资源池"""
		updated = []
		for row in self.readings:
			if not row.resource_pool:
				continue
			frappe.db.set_value("Resource Pool", row.resource_pool, "cpu_used", flt(row.cpu_used))
			frappe.db.set_value("Resource Pool", row.resource_pool, "memory_used", flt(row.memory_used))
			frappe.db.set_value("Resource Pool", row.resource_pool, "storage_used", flt(row.storage_used))
			if row.status:
				frappe.db.set_value("Resource Pool", row.resource_pool, "status", row.status)
			updated.append(row.resource_pool)

		return updated

	def on_complete(self):
		updated = self.apply_readings()

		if self.lease_order:
			current = frappe.db.get_value("Lease Order", self.lease_order, "status")
			if current == "草稿":
				frappe.db.set_value("Lease Order", self.lease_order, "status", "已确认")

		return {
			"pools_updated": updated,
			"deduct": {
				"cpu": flt(self.cpu_deduct),
				"memory": flt(self.memory_deduct),
				"storage": flt(self.storage_deduct),
			},
			"notify": {
				"elink_bot": bool(self.notify_elink_bot),
				"sms": bool(self.notify_sms),
			},
		}
