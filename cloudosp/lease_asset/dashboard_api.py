import frappe
from frappe import _
from frappe.utils import cint, flt

DIMENSIONS = [
	("cpu", _("CPU"), _("核")),
	("memory", _("内存"), _("GB")),
	("storage", _("存储"), _("TB")),
]


def _label(pool):
	return frappe.db.get_value("Resource Pool", pool, "pool_name") or pool


def _dim_stats(total, used):
	total = flt(total)
	used = flt(used)
	available = max(total - used, 0)
	return {
		"total": total,
		"used": used,
		"available": available,
		"level": int(round(used / total * 100)) if total else 0,
	}


def _dimensions(source):
	rows = []
	for key, label, unit in DIMENSIONS:
		stats = _dim_stats(source.get(f"{key}_total"), source.get(f"{key}_used"))
		rows.append({"key": key, "label": label, "unit": unit, **stats})
	return rows


def get_capacity_overview():
	"""全部资源池的三维容量合计"""
	sums = {}
	for row in frappe.get_all(
		"Resource Pool",
		fields=["cpu_total", "cpu_used", "memory_total", "memory_used", "storage_total", "storage_used"],
	):
		for key, _label, _unit in DIMENSIONS:
			for suffix in ("total", "used"):
				field = f"{key}_{suffix}"
				sums[field] = sums.get(field, 0) + flt(row.get(field))

	return {"dimensions": _dimensions(sums), "pool_count": frappe.db.count("Resource Pool")}


def _group_count(rows, key):
	grouped = {}
	for row in rows:
		grouped[row.get(key) or _("未分类")] = grouped.get(row.get(key) or _("未分类"), 0) + 1
	return grouped


def _flat_pools(topology):
	"""把树形拓扑拉平，便于前端快速定位资源池及其层级路径"""
	pools = []
	for dc in topology.get("data_centers", []):
		for zone in dc.get("zones", []):
			for region in zone.get("regions", []):
				for pool in region.get("pools", []):
					pools.append(
						{
							"name": pool["name"],
							"label": pool["pool_name"],
							"architecture": pool["architecture"],
							"pool_type": pool["pool_type"],
							"region": region["label"],
							"network_zone": zone["label"],
							"data_center": dc["label"],
						}
					)
	return pools


@frappe.whitelist()
def get_dashboard_data():
	from cloudosp.lease_asset.resource_pool_api import get_topology

	topology = get_topology()
	return {
		"topology": topology,
		"pools": _flat_pools(topology),
		"overview": get_capacity_overview(),
	}


@frappe.whitelist()
def get_pool_capacity(pool):
	"""单个资源池的三维容量：总容量 / 水位 / 可售容量"""
	if not pool:
		frappe.throw(_("请先选择一个资源池"))

	row = frappe.db.get_values(
		"Resource Pool",
		pool,
		["cpu_total", "cpu_used", "memory_total", "memory_used", "storage_total", "storage_used"],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("资源池 {0} 不存在").format(pool))

	return {"pool": pool, "pool_name": _label(pool), "dimensions": _dimensions(row[0])}


@frappe.whitelist()
def get_sold_summary(pool):
	"""已售标签：该资源池上已售出的云主机（租赁资产）统计与清单"""
	if not pool:
		frappe.throw(_("请先选择一个资源池"))

	rows = frappe.get_all(
		"Lease Asset",
		filters={"resource_pool": pool, "docstatus": ("!=", 2)},
		fields=[
			"name",
			"asset_name",
			"customer",
			"service_status",
			"start_date",
			"end_date",
			"lease_order",
			"docstatus",
		],
		order_by="creation desc",
		limit_page_length=200,
	)

	customers = {}
	app_count = 0
	for row in rows:
		row["customer_name"] = frappe.db.get_value("Customer", row.customer, "customer_name") if row.customer else ""
		row["app_count"] = frappe.db.count("Lease Asset Application", {"parent": row.name})
		app_count += row["app_count"]
		if row.customer:
			customers[row.customer] = customers.get(row.customer, 0) + 1

	status_count = _group_count(rows, "service_status")

	return {
		"pool": pool,
		"pool_name": _label(pool),
		"stats": {
			"total": len(rows),
			"customers": len(customers),
			"applications": app_count,
			"by_status": status_count,
			"in_service": status_count.get("在用", 0),
		},
		"rows": rows,
	}


@frappe.whitelist()
def get_asset_summary(pool):
	"""资产标签：该资源池关联的物理机（自有资产）统计与清单"""
	if not pool:
		frappe.throw(_("请先选择一个资源池"))

	owners = {}
	for row in frappe.get_all(
		"Lease Asset",
		filters={"resource_pool": pool, "asset": ("is", "set"), "docstatus": ("!=", 2)},
		fields=["name", "asset", "asset_name", "customer"],
	):
		owners.setdefault(row.asset, []).append(
			{
				"lease_asset": row.name,
				"lease_asset_name": row.asset_name,
				"customer": row.customer,
				"customer_name": frappe.db.get_value("Customer", row.customer, "customer_name")
				if row.customer
				else "",
				"source": _("租赁资产"),
			}
		)

	for row in frappe.get_all(
		"Lease Asset Job",
		filters={"resource_pool": pool, "job_type": "资产新增", "asset": ("is", "set")},
		fields=["name", "asset", "status"],
	):
		owners.setdefault(row.asset, []).append(
			{
				"lease_asset": row.name,
				"lease_asset_name": row.name,
				"customer": None,
				"customer_name": "",
				"source": _("资产新增作业") + f" ({row.status})",
			}
		)

	for row in frappe.get_all(
		"Lease Asset Receipt Item", filters={"asset": ("is", "set")}, fields=["name", "asset", "parent"]
	):
		receipt = frappe.db.get_value("Lease Asset Receipt", row.parent, ["resource_pool", "status"], as_dict=True)
		if not receipt or receipt.resource_pool != pool or receipt.status == "已取消":
			continue
		owners.setdefault(row.asset, []).append(
			{
				"lease_asset": row.parent,
				"lease_asset_name": row.parent,
				"customer": None,
				"customer_name": "",
				"source": _("扩容接收") + f" ({receipt.status})",
			}
		)

	names = list(owners.keys())
	assets = (
		frappe.get_all(
			"Asset",
			filters={"name": ("in", names)},
			fields=["name", "asset_name", "asset_category", "location", "status", "company", "purchase_date"],
			order_by="asset_name asc",
		)
		if names
		else []
	)

	for asset in assets:
		asset["linked"] = owners.get(asset.name, [])

	return {
		"pool": pool,
		"pool_name": _label(pool),
		"stats": {
			"total": len(assets),
			"by_status": _group_count(assets, "status"),
			"by_category": _group_count(assets, "asset_category"),
			"assigned": len({item["customer"] for rows in owners.values() for item in rows if item["customer"]}),
		},
		"rows": assets,
	}
