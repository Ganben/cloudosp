# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

DIMENSION_FIELD = {"CPU": "cpu_total", "内存": "memory_total", "存储": "storage_total"}


class LeaseAssetReceipt(Document):
	def validate(self):
		self.validate_items()
		self.validate_capacity()
		self.validate_cost()

	def validate_items(self):
		if not self.items:
			frappe.throw("请至少录入一条接收资产")

		for row in self.items:
			if not row.asset and not row.serial_no:
				frappe.throw(f"资产明细第 {row.idx} 行：请填写资产序列号或选择资产")

	def validate_capacity(self):
		for row in self.capacity_items:
			if row.entry_type == "容量":
				if not row.dimension:
					frappe.throw(f"容量入库第 {row.idx} 行：请选择资源维度")
				if not flt(row.capacity_qty):
					frappe.throw(f"容量入库第 {row.idx} 行：请填写容量数量")
			else:
				if not row.product:
					frappe.throw(f"容量入库第 {row.idx} 行：请选择物料项目")
				if not flt(row.quantity):
					frappe.throw(f"容量入库第 {row.idx} 行：请填写物料数量")

	def validate_cost(self):
		if self.capital_cost and self.expense_cost:
			allocated = flt(self.capital_cost) + flt(self.expense_cost)
			if allocated and abs(allocated - flt(self.total_cost)) > 0.01:
				frappe.throw(
					f"资本成本 + 费用成本（{allocated}）与总成本（{flt(self.total_cost)}）不一致"
				)

	def capacity_summary(self):
		"""本次入库带来的容量增量"""
		added = {field: 0 for field in DIMENSION_FIELD.values()}
		materials = []
		for row in self.capacity_items:
			if row.entry_type == "容量":
				field = DIMENSION_FIELD.get(row.dimension)
				if field:
					added[field] += flt(row.capacity_qty)
			else:
				materials.append(
					{"product": row.product, "product_name": row.product_name, "quantity": flt(row.quantity)}
				)
		return {"added": added, "materials": materials}

	def receive_capacity(self):
		"""容量入库：容量累加到资源池，物料累加到该池的产品库存"""
		summary = self.capacity_summary()
		pool = frappe.get_doc("Resource Pool", self.resource_pool)

		for field, value in summary["added"].items():
			if value:
				pool.set(field, flt(pool.get(field)) + value)
		pool.save(ignore_permissions=True)

		for row in summary["materials"]:
			name = frappe.db.get_value(
				"Lease Product Stock", {"product": row["product"], "resource_pool": self.resource_pool}, "name"
			)
			if name:
				stock = frappe.get_doc("Lease Product Stock", name)
				stock.total_qty = flt(stock.total_qty) + row["quantity"]
				stock.save(ignore_permissions=True)
			else:
				stock = frappe.new_doc("Lease Product Stock")
				stock.product = row["product"]
				stock.resource_pool = self.resource_pool
				stock.total_qty = row["quantity"]
				stock.used_qty = 0
				stock.save(ignore_permissions=True)

		return summary

	def on_submit_complete(self):
		"""由 API 在完成接收时调用：容量入库 + 关闭关联的补货单"""
		summary = self.receive_capacity()

		if self.replenish_order and frappe.db.exists("Lease Replenish Order", self.replenish_order):
			frappe.db.set_value("Lease Replenish Order", self.replenish_order, "status", "已完成")
			frappe.db.set_value(
				"Lease Replenish Order",
				self.replenish_order,
				"actual_date",
				self.receipt_date or frappe.utils.nowdate(),
			)

		return summary
