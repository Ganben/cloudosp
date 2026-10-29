import frappe
from frappe import _
from frappe.model.document import Document


class ResourceSpec(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from cloudosp.cloudosp.doctype.spec_capacity_requirement.spec_capacity_requirement import (
			SpecCapacityRequirement,
		)
		from cloudosp.cloudosp.doctype.spec_compute_item.spec_compute_item import SpecComputeItem
		from cloudosp.cloudosp.doctype.spec_network_item.spec_network_item import SpecNetworkItem
		from cloudosp.cloudosp.doctype.spec_storage_item.spec_storage_item import SpecStorageItem

		capacity_requirements: DF.Table[SpecCapacityRequirement]
		cloud_product: DF.Link
		compute_items: DF.Table[SpecComputeItem]
		disk_gb: DF.Float
		ip_count: DF.Float
		memory_gb: DF.Float
		network_items: DF.Table[SpecNetworkItem]
		product_type: DF.Data | None
		resource_pool: DF.Link | None
		spec_code: DF.Data
		spec_name: DF.Data
		storage_items: DF.Table[SpecStorageItem]
		vcpu_count: DF.Int
	# end: auto-generated types

	def validate(self):
		if not self.capacity_requirements:
			frappe.throw(_("规格至少需要一条容量需求记录"))
		self.validate_storage_items()

	def validate_storage_items(self):
		for row in self.storage_items or []:
			if row.capacity_gb is None or row.capacity_gb <= 0:
				frappe.throw(_("第 {0} 行：存储容量必须大于 0").format(row.idx))
			expected_model = "对象存储" if row.storage_type == "共享存储" else "云硬盘"
			if row.storage_model and row.storage_model != expected_model:
				frappe.throw(
					_("第 {0} 行：存储类型 {1} 的型号应为 {2}").format(
						row.idx, row.storage_type, expected_model
					)
				)
