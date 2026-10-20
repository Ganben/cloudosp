# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

UNIT_BY_DIMENSION = {"CPU": "核", "内存": "GB", "存储": "TB"}


class LeaseProduct(Document):
	def validate(self):
		self.validate_specs()
		self.apply_default_resource_pool()
		self.set_capacity_measures()

	def validate_specs(self):
		if not self.specs:
			frappe.throw("一个产品至少需要一条规格")

		seen = []
		for row in self.specs:
			if not row.spec and not row.spec_name:
				frappe.throw(f"规格第 {row.idx} 行：请选择规格项，或填写自定义规格名称")

			key = row.spec or row.spec_name
			if key in seen:
				frappe.throw(f"规格项「{key}」重复，请合并数量")
			seen.append(key)

			if not row.spec and not row.spec_type:
				row.spec_type = "自定义"

	def apply_default_resource_pool(self):
		"""规格行未指定资源池时，继承产品上的默认资源池"""
		if not self.resource_pool:
			return

		for row in self.specs:
			if not row.resource_pool:
				row.resource_pool = self.resource_pool

	def set_capacity_measures(self):
		"""库存度量 = 数量 × 规格换算系数，单位取维度标准单位"""
		factors = {}
		for row in self.specs:
			if not row.spec:
				continue
			if row.spec not in factors:
				factors[row.spec] = flt(
					frappe.db.get_value("Lease Spec", row.spec, "canonical_factor")
				) or 1

			row.capacity_value = flt(row.quantity) * factors[row.spec]
			row.capacity_unit = UNIT_BY_DIMENSION.get(row.dimension, row.uom)
