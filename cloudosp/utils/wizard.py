"""产品新增向导的后端逻辑。

一次提交完成：
1. 资源池定义（按 pool_code 复用或新建）
2. 云产品与规格（含存储 / 计算 / 网络三类资源配置、约定资源量与容量需求）
3. 型号（云产品 + 规格）及可售数量写入「云产品目录」
"""

from __future__ import annotations

import json

import frappe
from frappe import _

CAPACITY_TYPES = ("计算", "存储", "IP")
STORAGE_TYPES = ("系统盘", "数据盘", "共享存储")
COMPUTE_TYPES = ("CPU", "内存")
NETWORK_TYPES = ("私网网卡", "私网IP", "EIP", "CLB", "NAT", "其他")


def _as_dict(payload) -> dict:
	if isinstance(payload, str):
		payload = json.loads(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("参数格式错误"))
	return payload


def _require(value, label, idx: int | None = None):
	if value in (None, ""):
		prefix = _("第 {0} 行：").format(idx) if idx else ""
		frappe.throw(prefix + _("{0} 不能为空").format(label))


def _flt(value, label: str, idx: int, allow_negative: bool = False) -> float:
	try:
		value = float(value or 0)
	except (TypeError, ValueError):
		frappe.throw(_("第 {0} 行：{1}必须是数字").format(idx, label))
	if not allow_negative and value < 0:
		frappe.throw(_("第 {0} 行：{1}不能为负数").format(idx, label))
	return value


@frappe.whitelist()
def get_product_types() -> list[dict]:
	"""可选产品类型（计算 / 存储 / 网络，区分基础产品）。"""
	return frappe.get_all(
		"Product Type",
		filters={"enabled": 1},
		fields=["name", "category", "is_base_product", "description"],
		order_by="category asc, is_base_product desc, name asc",
	)


@frappe.whitelist()
def get_pool_context(pool_code: str | None = None) -> dict:
	"""查询资源池现状，用于向导预填（不存在则返回空结构）。"""
	if not pool_code or not frappe.db.exists("Resource Pool", pool_code):
		return {"exists": False, "products": [], "specs": [], "catalog_items": []}

	return {
		"exists": True,
		"pool": frappe.db.get_value(
			"Resource Pool", pool_code, ["pool_code", "pool_name", "region"], as_dict=True
		),
		"products": frappe.get_all(
			"Cloud Product",
			filters={"resource_pool": pool_code},
			fields=["name", "product_name", "product_type"],
		),
		"specs": frappe.get_all(
			"Resource Spec",
			filters={"resource_pool": pool_code},
			fields=["name", "spec_name", "cloud_product"],
		),
		"catalog_items": frappe.get_all(
			"Catalog Item",
			filters={"resource_pool": pool_code},
			fields=["name", "cloud_product", "spec", "model_name", "sellable_qty", "enabled"],
		),
	}


@frappe.whitelist()
def create_configuration(payload) -> dict:
	"""按向导提交的数据创建/更新资源池、云产品、规格与云产品目录条目。"""
	data = _as_dict(payload)

	if not (frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()):
		frappe.throw(_("仅系统管理员可执行产品配置"), frappe.PermissionError)

	pool_data = data.get("pool") or {}
	product_data = data.get("product") or {}
	spec_data = data.get("spec") or {}
	catalog_data = data.get("catalog") or {}

	_require(pool_data.get("pool_code"), _("资源池编码"))
	_require(pool_data.get("pool_name"), _("资源池名称"))
	_require(product_data.get("product_code"), _("产品编码"))
	_require(product_data.get("product_name"), _("产品名称"))
	_require(product_data.get("product_type"), _("产品类型"))
	_require(spec_data.get("spec_code"), _("规格编码"))
	_require(spec_data.get("spec_name"), _("规格名称"))

	product_type = frappe.db.get_value(
		"Product Type", product_data["product_type"], ["type_name", "enabled"], as_dict=True
	)
	if not product_type:
		frappe.throw(_("产品类型 {0} 不存在").format(product_data["product_type"]))
	if not product_type.enabled:
		frappe.throw(_("产品类型 {0} 已停用").format(product_data["product_type"]))

	requirements = _parse_requirements(spec_data)
	storage_items = _parse_storage_items(spec_data.get("storage_items") or [])
	compute_items = _parse_compute_items(spec_data.get("compute_items") or [])
	network_items = _parse_network_items(spec_data.get("network_items") or [])

	pool = _ensure_pool(pool_data)
	product = _ensure_product(product_data, pool)
	spec = _ensure_spec(spec_data, product, requirements, storage_items, compute_items, network_items)
	catalog_item = _upsert_catalog_item(catalog_data, pool, product, spec)

	return {"pool": pool, "product": product, "spec": spec, "catalog_item": catalog_item}


def _parse_requirements(spec_data: dict) -> dict[str, float]:
	raw = spec_data.get("requirements") or {}
	if isinstance(raw, list):
		raw = {row.get("capacity_type"): row.get("requirement_qty") for row in raw if row}
	requirements = {}
	for capacity_type, qty in raw.items():
		if capacity_type not in CAPACITY_TYPES:
			frappe.throw(_("容量类型 {0} 不合法").format(capacity_type))
		qty = _flt(qty, _("容量需求"), 0)
		if qty:
			requirements[capacity_type] = qty
	if not requirements:
		frappe.throw(_("请至少填写一项容量需求（计算 / 存储 / IP）"))
	return requirements


def _parse_storage_items(rows: list) -> list[dict]:
	out = []
	for idx, row in enumerate(rows, start=1):
		_require(row.get("storage_type"), _("存储类型"), idx)
		if row["storage_type"] not in STORAGE_TYPES:
			frappe.throw(_("第 {0} 行：存储类型 {1} 不合法").format(idx, row["storage_type"]))
		expected_model = "对象存储" if row["storage_type"] == "共享存储" else "云硬盘"
		model = row.get("storage_model") or expected_model
		if model != expected_model:
			frappe.throw(
				_("第 {0} 行：存储类型 {1} 的型号应为 {2}").format(idx, row["storage_type"], expected_model)
			)
		capacity = _flt(row.get("capacity_gb"), _("容量"), idx)
		if capacity <= 0:
			frappe.throw(_("第 {0} 行：存储容量必须大于 0").format(idx))
		out.append(
			{
				"storage_type": row["storage_type"],
				"storage_model": model,
				"capacity_gb": capacity,
				"quantity": int(row.get("quantity") or 1),
				"performance": row.get("performance"),
			}
		)
	return out


def _parse_compute_items(rows: list) -> list[dict]:
	out = []
	for idx, row in enumerate(rows, start=1):
		_require(row.get("compute_type"), _("计算类型"), idx)
		if row["compute_type"] not in COMPUTE_TYPES:
			frappe.throw(_("第 {0} 行：计算类型 {1} 不合法").format(idx, row["compute_type"]))
		_require(row.get("spec_model"), _("规格型号"), idx)
		out.append(
			{
				"compute_type": row["compute_type"],
				"spec_model": row["spec_model"],
				"quantity": int(row.get("quantity") or 1),
				"remark": row.get("remark"),
			}
		)
	return out


def _parse_network_items(rows: list) -> list[dict]:
	out = []
	for idx, row in enumerate(rows, start=1):
		_require(row.get("network_type"), _("网络类型"), idx)
		if row["network_type"] not in NETWORK_TYPES:
			frappe.throw(_("第 {0} 行：网络类型 {1} 不合法").format(idx, row["network_type"]))
		linked_product = row.get("linked_product")
		if linked_product and not frappe.db.exists("Cloud Product", linked_product):
			frappe.throw(_("第 {0} 行：关联云产品 {1} 不存在").format(idx, linked_product))
		out.append(
			{
				"network_type": row["network_type"],
				"linked_product": linked_product,
				"binding_target": row.get("binding_target"),
				"quantity": int(row.get("quantity") or 1),
				"bandwidth_mbps": _flt(row.get("bandwidth_mbps"), _("带宽"), idx),
				"remark": row.get("remark"),
			}
		)
	return out


def _ensure_pool(pool_data: dict) -> str:
	pool_code = pool_data["pool_code"]
	if frappe.db.exists("Resource Pool", pool_code):
		doc = frappe.get_doc("Resource Pool", pool_code)
		doc.pool_name = pool_data["pool_name"]
		doc.region = pool_data.get("region") or doc.region
		doc.save(ignore_permissions=True)
		return doc.name

	return (
		frappe.get_doc(
			{
				"doctype": "Resource Pool",
				"pool_code": pool_code,
				"pool_name": pool_data["pool_name"],
				"region": pool_data.get("region"),
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _ensure_product(product_data: dict, pool: str) -> str:
	product_code = product_data["product_code"]
	if frappe.db.exists("Cloud Product", product_code):
		doc = frappe.get_doc("Cloud Product", product_code)
		if doc.resource_pool != pool:
			frappe.throw(
				_("云产品 {0} 已属于资源池 {1}").format(product_code, doc.resource_pool)
			)
		doc.product_name = product_data["product_name"]
		doc.product_type = product_data["product_type"]
		doc.save(ignore_permissions=True)
		return doc.name

	return (
		frappe.get_doc(
			{
				"doctype": "Cloud Product",
				"product_code": product_code,
				"product_name": product_data["product_name"],
				"product_type": product_data["product_type"],
				"resource_pool": pool,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _ensure_spec(
	spec_data: dict,
	product: str,
	requirements: dict[str, float],
	storage_items: list[dict],
	compute_items: list[dict],
	network_items: list[dict],
) -> str:
	spec_code = spec_data["spec_code"]
	values = {
		"spec_name": spec_data["spec_name"],
		"vcpu_count": spec_data.get("vcpu_count") or 0,
		"memory_gb": spec_data.get("memory_gb") or 0,
		"disk_gb": spec_data.get("disk_gb") or 0,
		"ip_count": spec_data.get("ip_count") or 0,
	}

	if frappe.db.exists("Resource Spec", spec_code):
		doc = frappe.get_doc("Resource Spec", spec_code)
		if doc.cloud_product != product:
			frappe.throw(_("规格 {0} 已属于云产品 {1}").format(spec_code, doc.cloud_product))
		doc.update(values)
		doc.set("capacity_requirements", [])
		doc.set("storage_items", [])
		doc.set("compute_items", [])
		doc.set("network_items", [])
	else:
		doc = frappe.get_doc(
			{"doctype": "Resource Spec", "spec_code": spec_code, "cloud_product": product, **values}
		)

	for capacity_type, qty in requirements.items():
		doc.append("capacity_requirements", {"capacity_type": capacity_type, "requirement_qty": qty})
	for row in storage_items:
		doc.append("storage_items", row)
	for row in compute_items:
		doc.append("compute_items", row)
	for row in network_items:
		doc.append("network_items", row)

	doc.save(ignore_permissions=True)
	return doc.name


def _upsert_catalog_item(catalog_data: dict, pool: str, product: str, spec: str) -> str:
	sellable_qty = _flt(catalog_data.get("sellable_qty"), _("可售数量"), 0)
	enabled = 1 if catalog_data.get("enabled", 1) else 0

	existing = frappe.db.get_value(
		"Catalog Item", {"resource_pool": pool, "cloud_product": product, "spec": spec}, "name"
	)
	if existing:
		doc = frappe.get_doc("Catalog Item", existing)
		doc.sellable_qty = sellable_qty
		doc.enabled = enabled
		doc.save(ignore_permissions=True)
		return doc.name

	return (
		frappe.get_doc(
			{
				"doctype": "Catalog Item",
				"resource_pool": pool,
				"cloud_product": product,
				"spec": spec,
				"sellable_qty": sellable_qty,
				"enabled": enabled,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)
