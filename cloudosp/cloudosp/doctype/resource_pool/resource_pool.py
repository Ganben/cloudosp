import frappe
from frappe.model.document import Document


class ResourcePool(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		disabled: DF.Check
		pool_code: DF.Data
		pool_name: DF.Data
		region: DF.Data | None
	# end: auto-generated types
