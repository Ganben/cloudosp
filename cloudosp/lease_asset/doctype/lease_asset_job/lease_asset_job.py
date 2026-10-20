# Copyright (c) 2026: Cloud Platform DigiOp
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint


class LeaseAssetJob(Document):
	def validate(self):
		self.validate_period()

	def validate_period(self):
		if self.start_date and self.end_date and self.end_date < self.start_date:
			frappe.throw("结束日期不能早于开始日期")

	def on_update(self):
		self.sync_lease_asset_status()

	def sync_lease_asset_status(self):
		"""作业开始/完成时，回写租赁资产的服务状态"""
		if not self.lease_asset:
			return

		lease_asset = frappe.get_doc("Lease Asset", self.lease_asset)
		if self.status == "进行中" and lease_asset.service_status == "未交付":
			lease_asset.db_set("service_status", "在用")
		elif self.status == "已完成" and lease_asset.service_status == "未交付":
			lease_asset.db_set("service_status", "在用")


@frappe.whitelist()
def get_assets_on_job(*args, **kwargs):
	"""Number Card 自定义数据来源：处于进行中作业中的租赁资产数量"""
	count = frappe.db.sql(
		"""
		select count(distinct lease_asset)
		from `tabLease Asset Job`
		where status = %s and lease_asset is not null and docstatus != 2
		""",
		("进行中",),
	)[0][0]

	return {
		"value": cint(count),
		"fieldtype": "Int",
		"route": ["List", "Lease Asset"],
		"route_options": {},
	}
