"""容量需求计算与库存校验共享逻辑。

口径：
- 需求量：清单行 数量 × 规格.规格容量需求.requirement_qty，按（资源池, 容量类型）聚合
- 可用量：Σ(容量池.可售库存) - Σ(容量池.预占数量)，按（资源池, 容量类型）聚合
- 预订单提交：不校验库存，将需求计入容量池「预占数量」；取消时释放
- 申请订单提交：校验需求量 ≤ 可用量，超出则抛 ValidationError 不能下单
"""

from __future__ import annotations

import frappe
from frappe import _


def get_capacity_demand(items) -> dict[tuple[str, str], float]:
	"""从订单产品清单计算容量需求。返回 {(resource_pool, capacity_type): qty}。"""
	demand: dict[tuple[str, str], float] = {}
	spec_cache: dict[str, object] = {}
	for item in items:
		qty = item.quantity or 0
		if qty <= 0:
			continue
		spec = spec_cache.get(item.spec)
		if spec is None:
			spec = frappe.get_doc("Resource Spec", item.spec)
			spec_cache[item.spec] = spec
		for row in spec.capacity_requirements:
			key = (spec.resource_pool, row.capacity_type)
			demand[key] = demand.get(key, 0) + (row.requirement_qty or 0) * qty
	return demand


def get_available_stock() -> dict[tuple[str, str], float]:
	"""按（资源池, 容量类型）聚合可售量 = Σ可售库存 - Σ预占数量。"""
	rows = frappe.db.sql(
		"""select resource_pool, capacity_type,
				sum(sellable_stock) as sellable, sum(reserved_qty) as reserved
			from `tabAZ Capacity Pool`
			group by resource_pool, capacity_type""",
		as_dict=True,
	)
	return {
		(r.resource_pool, r.capacity_type): (r.sellable or 0) - (r.reserved or 0)
		for r in rows
	}


def validate_stock(demand: dict[tuple[str, str], float]) -> None:
	"""校验容量需求是否超出可售库存，超出则抛异常禁止下单。"""
	available = get_available_stock()
	errors = []
	for (pool, capacity_type), qty in sorted(demand.items()):
		avail = available.get((pool, capacity_type), 0)
		if qty > avail:
			errors.append(
				_("资源池 [{0}] 容量类型 [{1}]：需求 {2} 超出可售量 {3}").format(
					pool, capacity_type, f"{qty:g}", f"{avail:g}"
				)
			)
	if errors:
		frappe.throw(_("超出可售库存，不能下单：\n") + "\n".join(errors), frappe.ValidationError)


def adjust_reserved(demand: dict[tuple[str, str], float], sign: int = 1) -> None:
	"""按（资源池, 容量类型）增减 AZ 容量池预占数量。sign=1 预占，sign=-1 释放。

	同类型多个 AZ 容量池时按预占数量升序依次分摊。
	"""
	for (pool, capacity_type), qty in sorted(demand.items()):
		if qty <= 0:
			continue
		az_pools = frappe.db.sql(
			"""select name, reserved_qty
				from `tabAZ Capacity Pool`
				where resource_pool = %(pool)s and capacity_type = %(ctype)s
				order by reserved_qty asc
				for update""",
			{"pool": pool, "ctype": capacity_type},
			as_dict=True,
		)
		if not az_pools:
			frappe.throw(_("资源池 [{0}] 不存在容量类型为 [{1}] 的 AZ 容量池").format(pool, capacity_type))
		remaining = qty
		for az in az_pools:
			if remaining <= 0:
				break
			if sign > 0:
				alloc = remaining
			else:
				alloc = min(remaining, az.reserved_qty or 0)
			new_reserved = (az.reserved_qty or 0) + sign * alloc
			if new_reserved < 0:
				new_reserved = 0
			remaining -= alloc
			frappe.db.set_value("AZ Capacity Pool", az.name, "reserved_qty", new_reserved, update_modified=False)


def build_demand_summary(demand: dict[tuple[str, str], float], with_available: bool = False) -> str:
	"""生成容量需求汇总文本，用于单据只读展示。"""
	if not demand:
		return ""
	available = get_available_stock() if with_available else {}
	lines = []
	for (pool, capacity_type), qty in sorted(demand.items()):
		line = _("资源池 [{0}] / {1}：需求 {2}").format(pool, capacity_type, qty)
		if with_available:
			line += _("，可用 {0}").format(available.get((pool, capacity_type), 0))
		lines.append(line)
	return "\n".join(lines)
