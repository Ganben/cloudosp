import frappe
from frappe.model.document import Document


class CloudProduct(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		enabled: DF.Check
		product_code: DF.Data
		product_name: DF.Data
		product_type: DF.Literal["云主机计算", "云存储", "IP"]
		resource_pool: DF.Link
	# end: auto-generated types
