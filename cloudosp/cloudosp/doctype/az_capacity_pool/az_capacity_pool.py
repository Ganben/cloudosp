import frappe
from frappe.model.document import Document


class AZCapacityPool(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		available_stock: DF.Float
		az_name: DF.Data
		capacity_type: DF.Literal["计算", "存储", "IP"]
		reserved_qty: DF.Float
		resource_pool: DF.Link
		sellable_stock: DF.Float
		total_capacity: DF.Float
	# end: auto-generated types

	def validate(self):
		if self.sellable_stock < 0:
			frappe.throw(frappe._("可售库存不能为负数"))
		if self.reserved_qty < 0:
			frappe.throw(frappe._("预占数量不能为负数"))
		self.available_stock = (self.sellable_stock or 0) - (self.reserved_qty or 0)
