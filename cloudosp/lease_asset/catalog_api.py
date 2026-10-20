import json

import frappe
from frappe import _
from frappe.utils import cint, flt

ALLOWED_DOCTYPES = ("Lease Product", "Lease Spec")


def _as_dict(values):
	if isinstance(values, str):
		values = json.loads(values)
	return frappe._dict(values or {})


def _spec_rows(product):
	return frappe.get_all(
		"Lease Product Spec",
		filters={"parent": product},
		fields=["spec", "spec_name", "spec_type", "dimension", "quantity", "uom", "resource_pool",
				"capacity_value", "capacity_unit", "note"],
		order_by="idx asc",
	)


def _pool_label(pool):
	return frappe.db.get_value("Resource Pool", pool, "pool_name") if pool else ""


@frappe.whitelist()
def get_catalog_data():
	"""产品库 + 规格库 + 可选资源池"""
	products = []
	for row in frappe.get_all(
		"Lease Product",
		fields=["name", "product_code", "product_name", "category", "uom", "list_price", "status", "resource_pool"],
		order_by="product_name asc",
		limit_page_length=200,
	):
		row["specs"] = _spec_rows(row.name)
		row["resource_pool_name"] = _pool_label(row.resource_pool)
		products.append(row)

	specs = frappe.get_all(
		"Lease Spec",
		fields=["name", "spec_name", "spec_type", "dimension", "uom", "canonical_factor", "default_quantity", "status"],
		order_by="spec_name asc",
		limit_page_length=200,
	)

	pools = frappe.get_all(
		"Resource Pool",
		fields=["name", "pool_name", "pool_type", "region"],
		order_by="pool_name asc",
		limit_page_length=200,
	)
	for pool in pools:
		pool["label"] = pool.pool_name

	return {"products": products, "specs": specs, "pools": pools}


@frappe.whitelist()
def save_spec(values):
	values = _as_dict(values)
	name = values.get("name")
	doc = (
		frappe.get_doc("Lease Spec", name)
		if name and frappe.db.exists("Lease Spec", name)
		else frappe.new_doc("Lease Spec")
	)

	for key, value in values.items():
		if key in ("name", "doctype", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			doc.set(key, value)

	doc.save(ignore_permissions=True)
	return {"name": doc.name, "spec_name": doc.spec_name}


@frappe.whitelist()
def save_product(values):
	values = _as_dict(values)
	name = values.get("name")
	doc = (
		frappe.get_doc("Lease Product", name)
		if name and frappe.db.exists("Lease Product", name)
		else frappe.new_doc("Lease Product")
	)

	specs = values.get("specs") or []
	if isinstance(specs, str):
		specs = json.loads(specs)

	for key, value in values.items():
		if key in ("name", "doctype", "specs", "owner", "creation", "modified", "modified_by"):
			continue
		if doc.meta.has_field(key):
			doc.set(key, value)

	doc.set("specs", [])
	for row in specs:
		row = frappe._dict(row)
		doc.append(
			"specs",
			{
				"spec": row.get("spec") or None,
				"spec_name": row.get("spec_name") or None,
				"spec_type": row.get("spec_type") or None,
				"quantity": flt(row.get("quantity")) or 1,
				"resource_pool": row.get("resource_pool") or None,
				"note": row.get("note"),
			},
		)

	doc.save(ignore_permissions=True)
	return {"name": doc.name, "product_name": doc.product_name, "spec_count": len(doc.specs)}


@frappe.whitelist()
def delete_record(doctype, name):
	if doctype not in ALLOWED_DOCTYPES:
		frappe.throw(_("不支持的 DocType：{0}").format(doctype))

	frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	return {"name": name, "deleted": True}
