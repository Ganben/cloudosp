# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class LeaseAsset(Document):
	def validate(self):
		self.validate_period()

	def validate_period(self):
		if self.start_date and self.end_date and self.end_date < self.start_date:
			frappe.throw("退租日期不能早于起租日期")
