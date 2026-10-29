"""资源订单控制器 Mixin：清单校验、规格摘要与容量需求汇总。"""

from __future__ import annotations

import frappe
from frappe import _

from cloudosp.utils.stock import build_demand_summary, get_capacity_demand


class ResourceOrderMixin:
	# 提交时是否校验库存（申请订单覆写为 True）
	check_stock = False

	items: list

	def validate(self):
		self.validate_items()
		self.capacity_demand_summary = build_demand_summary(
			self.get_demand(),
			with_available=self.check_stock,
		)

	def validate_items(self):
		if not self.items:
			frappe.throw(_("云产品清单不能为空"))
		seen = set()
		for item in self.items:
			if item.quantity is None or item.quantity <= 0:
				frappe.throw(_("第 {0} 行：数量必须大于 0").format(item.idx))
			spec_product = frappe.db.get_value("Resource Spec", item.spec, "cloud_product")
			if spec_product != item.cloud_product:
				frappe.throw(
					_("第 {0} 行：规格 [{1}] 不属于云产品 [{2}]").format(item.idx, item.spec, item.cloud_product)
				)
			key = (item.cloud_product, item.spec)
			if key in seen:
				frappe.throw(_("云产品清单中存在重复的 产品+规格 组合：[{0} / {1}]").format(*key))
			seen.add(key)
			if not item.spec_summary:
				item.spec_summary = build_spec_summary(item.spec)

	def get_demand(self) -> dict[tuple[str, str], float]:
		return get_capacity_demand(self.items)


def build_spec_summary(spec_name: str) -> str:
	"""生成规格约定资源量摘要文本。"""
	parts = []
	for fieldname, label, unit in (
		("vcpu_count", "vCPU", "核"),
		("memory_gb", "内存", "GB"),
		("disk_gb", "磁盘", "GB"),
		("ip_count", "IP", "个"),
	):
		value = frappe.db.get_value("Resource Spec", spec_name, fieldname)
		if value:
			parts.append(f"{label} {value:g} {unit}")
	return "；".join(parts)
