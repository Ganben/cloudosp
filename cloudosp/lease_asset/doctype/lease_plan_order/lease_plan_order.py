# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

from ...plan_api import get_product_dimensions


class LeasePlanOrder(Document):
	def validate(self):
		self.calculate_resource_summary()

	def calculate_resource_summary(self):
		"""按区域汇总 CPU(核) / 内存(GB) / 存储(TB)；不做库存与配额校验"""
		grouped = {}
		for row in self.items:
			dims = get_product_dimensions(row.product)
			key = row.region or ""
			bucket = grouped.setdefault(key, {"cpu_total": 0, "memory_total": 0, "storage_total": 0})
			for dim in ("cpu_total", "memory_total", "storage_total"):
				bucket[dim] += dims[dim.replace("_total", "")] * flt(row.quantity)

		self.set("summary", [])
		for region, dims in grouped.items():
			self.append(
				"summary",
				{
					"region": region or None,
					"cpu_total": dims["cpu_total"],
					"memory_total": dims["memory_total"],
					"storage_total": dims["storage_total"],
				},
			)

		self.cpu_total = sum(d["cpu_total"] for d in grouped.values())
		self.memory_total = sum(d["memory_total"] for d in grouped.values())
		self.storage_total = sum(d["storage_total"] for d in grouped.values())
