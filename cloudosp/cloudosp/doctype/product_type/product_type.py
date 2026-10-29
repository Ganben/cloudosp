import frappe
from frappe.model.document import Document


class ProductType(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		category: DF.Literal["计算", "存储", "网络"]
		description: DF.SmallText | None
		enabled: DF.Check
		is_base_product: DF.Check
		type_name: DF.Data
	# end: auto-generated types
