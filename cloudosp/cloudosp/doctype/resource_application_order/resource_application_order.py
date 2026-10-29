import frappe
from frappe.model.document import Document

from cloudosp.base_order import ResourceOrderMixin
from cloudosp.utils.stock import validate_stock


class ResourceApplicationOrder(ResourceOrderMixin, Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from cloudosp.cloudosp.doctype.order_product_item.order_product_item import OrderProductItem

		capacity_demand_summary: DF.SmallText | None
		items: DF.Table[OrderProductItem]
		naming_series: DF.Literal["OSP-APP-.YYYY.-.####"]
		order_date: DF.Date
		status: DF.Literal["草稿", "已提交", "已取消"]
		tenant: DF.Link
	# end: auto-generated types

	check_stock = True

	def before_submit(self):
		# 下单校验：任一容量项需求超出可售量（可售库存 - 预占数量）则不能下单
		validate_stock(self.get_demand())
		self.status = "已提交"

	def on_cancel(self):
		self.status = "已取消"
