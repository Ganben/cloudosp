import frappe
from frappe.model.document import Document


class OrderProductItem(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		cloud_product: DF.Link
		quantity: DF.Int
		spec: DF.Link
		spec_summary: DF.SmallText | None
	# end: auto-generated types
