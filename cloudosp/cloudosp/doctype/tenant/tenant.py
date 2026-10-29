import frappe
from frappe.model.document import Document


class Tenant(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact_email: DF.Data | None
		contact_person: DF.Data | None
		contact_phone: DF.Data | None
		enabled: DF.Check
		tenant_name: DF.Data
	# end: auto-generated types
