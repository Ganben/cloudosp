# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class LeaseOrder(Document):
	def validate(self):
		self.validate_items()
		self.calculate_totals()

	def validate_items(self):
		if not self.items:
			frappe.throw("请至少添加一条租赁产品明细")

		products = [row.product for row in self.items]
		if len(products) != len(set(products)):
			frappe.throw("同一个租赁产品在明细中不可重复，请合并数量")

	def calculate_totals(self):
		total = 0
		for row in self.items:
			row.amount = flt(row.quantity) * flt(row.rate) * flt(row.lease_months)
			total += flt(row.amount)
		self.total_amount = total
