import frappe
from frappe.model.document import Document


class SpecComputeItem(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		compute_type: DF.Literal["CPU", "内存"]
		quantity: DF.Int
		remark: DF.Data | None
		spec_model: DF.Data
	# end: auto-generated types
