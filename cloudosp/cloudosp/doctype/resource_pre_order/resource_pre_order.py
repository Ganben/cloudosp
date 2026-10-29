import frappe
from frappe.model.document import Document

from cloudosp.base_order import ResourceOrderMixin
from cloudosp.utils.stock import adjust_reserved


class ResourcePreorder(ResourceOrderMixin, Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from cloudosp.cloudosp.doctype.order_product_item.order_product_item import OrderProductItem

		capacity_demand_summary: DF.SmallText | None
		expected_date: DF.Date | None
		items: DF.Table[OrderProductItem]
		naming_series: DF.Literal["OSP-PRB-.YYYY.-.####"]
		order_date: DF.Date
		status: DF.Literal["草稿", "已提交", "已取消"]
		tenant: DF.Link
	# end: auto-generated types

	def before_submit(self):
		# 预订单不校验资源池容量库存
		self.status = "已提交"

	def on_submit(self):
		# 提交时将容量需求计入容量池「预占数量」
		adjust_reserved(self.get_demand(), sign=1)

	def on_cancel(self):
		# 取消时释放预占
		adjust_reserved(self.get_demand(), sign=-1)
		self.status = "已取消"
