import json

import frappe
from frappe import _
from frappe.utils import cint, flt

ORG_DOCTYPES = ("Data Center", "Network Zone", "Region")


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


def _assert_known_doctype(doctype):
	if doctype not in ORG_DOCTYPES:
		frappe.throw(_("不支持的 DocType：{0}").format(doctype))


def _percentage(used, total):
	total = flt(total)
	return int(round(flt(used) / total * 100)) if total else 0


@frappe.whitelist()
def get_topology():
	"""机房 > 网络分区 > 区域 > 资源池 的树形拓扑"""
	pools = {}
	for row in frappe.get_all(
		"Resource Pool",
		fields=["name", "pool_name", "pool_type", "architecture", "total_capacity", "used_capacity", "status", "region"],
	):
		row["label"] = row.pool_name
		row["usage_percent"] = _percentage(row.used_capacity, row.total_capacity)
		pools.setdefault(row.region, []).append(row)

	regions = {}
	for row in frappe.get_all("Region", fields=["name", "region_name", "network_zone", "status"]):
		regions.setdefault(row.network_zone, []).append(
			{
				"name": row.name,
				"label": row.region_name,
				"status": row.status,
				"pools": sorted(pools.get(row.name, []), key=lambda r: r["pool_name"]),
			}
		)

	zones = {}
	for row in frappe.get_all(
		"Network Zone", fields=["name", "zone_name", "data_center", "zone_type", "cidr", "status"]
	):
		zones.setdefault(row.data_center, []).append(
			{
				"name": row.name,
				"label": row.zone_name,
				"zone_type": row.zone_type,
				"cidr": row.cidr,
				"status": row.status,
				"regions": sorted(regions.get(row.name, []), key=lambda r: r["label"]),
			}
		)

	data_centers = []
	for row in frappe.get_all("Data Center", fields=["name", "data_center_name", "city", "status"]):
		data_centers.append(
			{
				"name": row.name,
				"label": row.data_center_name,
				"city": row.city,
				"status": row.status,
				"zones": sorted(zones.get(row.name, []), key=lambda z: z["label"]),
			}
		)

	# 尚未挂到任何区域的资源池单独收集，避免从拓扑中丢失
	known_regions = {row["name"] for rows in regions.values() for row in rows}
	unassigned_pools = [
		pool for region, rows in pools.items() if region not in known_regions for pool in rows
	]

	return {
		"data_centers": sorted(data_centers, key=lambda d: d["label"]),
		"unassigned_pools": sorted(unassigned_pools, key=lambda p: p["pool_name"]),
	}


@frappe.whitelist()
def get_architecture_options():
	field = frappe.get_meta("Resource Pool").get_field("architecture")
	return [opt for opt in (field.options or "").split("\n") if opt] if field else []


@frappe.whitelist()
def save_org_record(doctype, values):
	_assert_known_doctype(doctype)
	values = _as_dict(values)

	name = values.get("name")
	doc = frappe.get_doc(doctype, name) if name and frappe.db.exists(doctype, name) else frappe.new_doc(doctype)

	for key, value in values.items():
		if key in ("name", "doctype", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			doc.set(key, value)

	doc.save(ignore_permissions=True)
	return {"name": doc.name, "label": doc.get(doc.meta.title_field) or doc.name}


@frappe.whitelist()
def save_resource_pool(values):
	values = _as_dict(values)

	name = values.get("name")
	doc = (
		frappe.get_doc("Resource Pool", name)
		if name and frappe.db.exists("Resource Pool", name)
		else frappe.new_doc("Resource Pool")
	)

	if not doc.get("name"):
		doc.set("naming_series", "RP-.YYYY.-")

	for key, value in values.items():
		if key in ("name", "doctype", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			if key in ("total_capacity", "used_capacity"):
				value = flt(value)
			doc.set(key, value)

	doc.save(ignore_permissions=True)
	return {"name": doc.name, "pool_name": doc.pool_name}


@frappe.whitelist()
def delete_record(doctype, name):
	if doctype not in ORG_DOCTYPES and doctype != "Resource Pool":
		frappe.throw(_("不支持的 DocType：{0}").format(doctype))

	frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	return {"name": name, "deleted": True}


@frappe.whitelist()
def get_resource_pool(name):
	doc = frappe.get_doc("Resource Pool", name)
	return {
		"name": doc.name,
		"pool_name": doc.pool_name,
		"pool_type": doc.pool_type,
		"architecture": doc.architecture,
		"region": doc.region,
		"total_capacity": flt(doc.total_capacity),
		"used_capacity": flt(doc.used_capacity),
		"status": doc.status,
	}
