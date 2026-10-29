import frappe
from frappe.model.document import Document


class SpecStorageItem(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		capacity_gb: DF.Float
		performance: DF.Data | None
		quantity: DF.Int
		storage_model: DF.Literal["云硬盘", "对象存储"]
		storage_type: DF.Literal["系统盘", "数据盘", "共享存储"]
	# end: auto-generated types
