import frappe
from frappe.model.document import Document


class SpecCapacityRequirement(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		capacity_type: DF.Literal["计算", "存储", "IP"]
		requirement_qty: DF.Float
	# end: auto-generated types
