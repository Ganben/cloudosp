import frappe
from frappe import _
from frappe.model.document import Document


class CatalogItem(Document):
	# begin: auto-generated types
	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		cloud_product: DF.Link
		enabled: DF.Check
		model_name: DF.Data | None
		resource_pool: DF.Link
		sellable_qty: DF.Float
		spec: DF.Link
	# end: auto-generated types

	def validate(self):
		if self.sellable_qty is None or self.sellable_qty < 0:
			frappe.throw(_("可售数量不能为负数"))

		spec = frappe.db.get_value(
			"Resource Spec", self.spec, ["cloud_product", "resource_pool", "spec_name"], as_dict=True
		)
		if not spec:
			frappe.throw(_("规格 {0} 不存在").format(self.spec))
		if spec.cloud_product != self.cloud_product:
			frappe.throw(_("规格 {0} 不属于云产品 {1}").format(self.spec, self.cloud_product))
		if spec.resource_pool and spec.resource_pool != self.resource_pool:
			frappe.throw(_("规格 {0} 不属于资源池 {1}").format(self.spec, self.resource_pool))

		product = frappe.db.get_value(
			"Cloud Product", self.cloud_product, ["resource_pool", "product_name"], as_dict=True
		)
		if not product:
			frappe.throw(_("云产品 {0} 不存在").format(self.cloud_product))
		if product.resource_pool != self.resource_pool:
			frappe.throw(_("云产品 {0} 不属于资源池 {1}").format(self.cloud_product, self.resource_pool))

		self.model_name = f"{product.product_name} / {spec.spec_name}"

		duplicate = frappe.db.exists(
			"Catalog Item",
			{
				"resource_pool": self.resource_pool,
				"cloud_product": self.cloud_product,
				"spec": self.spec,
				"name": ["!=", self.name],
			},
		)
		if duplicate:
			frappe.throw(
				_("云产品目录中已存在该型号（资源池 {0} / 云产品 {1} / 规格 {2}）：{3}").format(
					self.resource_pool, self.cloud_product, self.spec, duplicate
				)
			)
