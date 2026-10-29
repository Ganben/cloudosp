import frappe
from frappe.model.document import Document


class SpecNetworkItem(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		bandwidth_mbps: DF.Float
		binding_target: DF.Data | None
		linked_product: DF.Link | None
		network_type: DF.Literal["私网网卡", "私网IP", "EIP", "CLB", "NAT", "其他"]
		quantity: DF.Int
		remark: DF.Data | None
	# end: auto-generated types
