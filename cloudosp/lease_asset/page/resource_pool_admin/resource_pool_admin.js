frappe.pages["resource-pool-admin"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.resource_pool_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("资源池维护"),
		single_column: true,
	});

	$(`<style>
		.rp-layout { display: flex; gap: 20px; align-items: flex-start; }
		.rp-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.rp-form-panel { flex: 0 0 460px; }
		.rp-tree-panel { flex: 1 1 auto; min-width: 0; }
		.rp-title { margin: 0 0 12px; font-weight: 600; }
		.rp-actions { margin-top: 12px; }
		.rp-tree { font-size: 13px; line-height: 1.6; }
		.rp-dc { margin-bottom: 14px; padding-left: 6px; border-left: 3px solid var(--blue-500); }
		.rp-zone { margin: 6px 0 6px 16px; padding-left: 6px; border-left: 3px solid var(--cyan-500); }
		.rp-region { margin: 4px 0 4px 16px; padding-left: 6px; border-left: 3px solid var(--green-500); }
		.rp-pool { margin: 2px 0 2px 16px; padding-left: 6px; border-left: 3px solid var(--gray-400); }
		.rp-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.rp-bar { display: inline-block; width: 90px; height: 6px; background: var(--control-bg); border-radius: 3px; vertical-align: middle; margin: 0 6px; }
		.rp-bar > i { display: block; height: 6px; background: var(--green-500); border-radius: 3px; }
		.rp-empty { color: var(--text-muted); font-size: 12px; }
	</style>`).appendTo(page.main);

	const $layout = $(`
		<div class="rp-layout">
			<div class="rp-panel rp-form-panel">
				<h6 class="rp-title">${__("资源池信息")}</h6>
				<div class="rp-form"></div>
				<div class="rp-actions">
					<button class="btn btn-sm btn-primary rp-save">${__("保存")}</button>
					<button class="btn btn-sm btn-default rp-reset">${__("新建")}</button>
					<button class="btn btn-sm btn-danger rp-delete">${__("删除")}</button>
				</div>
				<div class="rp-msg mt-2"></div>
			</div>
			<div class="rp-panel rp-tree-panel">
				<h6 class="rp-title">${__("网络拓扑")}</h6>
				<div class="rp-tree"></div>
			</div>
		</div>
	`).appendTo(page.main);

	const $tree = $layout.find(".rp-tree");
	const $msg = $layout.find(".rp-msg");

	const fields = [
		{ fieldname: "name", fieldtype: "Data", label: __("ID"), read_only: 1, hidden: 1 },
		{ fieldname: "pool_name", fieldtype: "Data", label: __("资源池名称"), reqd: 1 },
		{ fieldname: "pool_type", fieldtype: "Select", label: __("资源类型"), options: "\n计算\n存储\n网络" },
		{ fieldname: "architecture", fieldtype: "Select", label: __("架构"), options: "\nx86\nARM" },
		{ fieldtype: "Column Break" },
		{ fieldname: "region", fieldtype: "Link", label: __("区域"), options: "Region" },
		{ fieldname: "total_capacity", fieldtype: "Float", label: __("总容量"), non_negative: 1 },
		{ fieldname: "used_capacity", fieldtype: "Float", label: __("已用容量"), non_negative: 1 },
		{
			fieldname: "status",
			fieldtype: "Select",
			label: __("状态"),
			options: "\n可用\n已满\n维护中",
			default: "可用",
		},
	];

	const form = new frappe.ui.FieldGroup({
		fields: fields,
		body: $layout.find(".rp-form").get(0),
		card_layout: false,
	});
	form.make();

	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);

	const show_msg = (text, type) => {
		$msg.html(text ? `<div class="alert alert-${type || "info"} small mb-0">${text}</div>` : "");
	};

	const reset_form = () => {
		form.set_values({
			name: "",
			pool_name: "",
			pool_type: "",
			architecture: "x86",
			region: "",
			total_capacity: 0,
			used_capacity: 0,
			status: "可用",
		});
		show_msg("");
	};

	const load_architectures = () => {
		api("get_architecture_options").then((options) => {
			if (!options || !options.length) return;
			const field = form.get_field("architecture");
			field.df.options = options.join("\n");
			field.refresh();
		});
	};

	const bar = (used, total) => {
		const percent = total > 0 ? Math.round((used / total) * 100) : 0;
		return `<span class="rp-bar" title="${used}/${total}"><i style="width:${Math.min(percent, 100)}%"></i></span>${percent}%`;
	};

	const render_tree = (data) => {
		let html = "";
		const escape = (val) => frappe.utils.escape_html(val || "");

		data.data_centers.forEach((dc) => {
			html += `<div class="rp-dc"><b>${escape(dc.label)}</b><span class="rp-tag">ID ${escape(
				dc.name
			)}${dc.city ? " · " + escape(dc.city) : ""} · ${escape(dc.status)}</span>`;
			if (!dc.zones.length) {
				html += `<div class="rp-empty">${__("暂无网络分区")}</div>`;
			}
			dc.zones.forEach((zone) => {
				html += `<div class="rp-zone"><b>${escape(zone.label)}</b><span class="rp-tag">${escape(
					zone.zone_type || __("未分类")
				)}${zone.cidr ? " · " + escape(zone.cidr) : ""}</span>`;
				if (!zone.regions.length) {
					html += `<div class="rp-empty">${__("暂无区域")}</div>`;
				}
				zone.regions.forEach((region) => {
					html += `<div class="rp-region"><b>${escape(region.label)}</b><span class="rp-tag">ID ${escape(
						region.name
					)}</span>`;
					if (!region.pools.length) {
						html += `<div class="rp-empty">${__("暂无资源池")}</div>`;
					}
					region.pools.forEach((pool) => {
						html += `<div class="rp-pool">${escape(pool.pool_name)}<span class="rp-tag">${escape(
							pool.architecture
						)} · ${escape(pool.pool_type || __("未分类"))} · ${escape(pool.status)}</span>
							${bar(pool.used_capacity, pool.total_capacity)}
							<button class="btn btn-xs btn-default rp-edit" data-name="${escape(pool.name)}">${__(
							"编辑"
						)}</button></div>`;
					});
					html += `</div>`;
				});
				html += `</div>`;
			});
			html += `</div>`;
		});

		if (data.unassigned_pools && data.unassigned_pools.length) {
			html += `<div class="rp-dc"><b>${__("未分配区域的资源池")}</b>`;
			data.unassigned_pools.forEach((pool) => {
				html += `<div class="rp-pool">${escape(pool.pool_name)}<span class="rp-tag">${escape(
					pool.architecture
				)} · ${escape(pool.pool_type || __("未分类"))}</span>
					${bar(pool.used_capacity, pool.total_capacity)}
					<button class="btn btn-xs btn-default rp-edit" data-name="${escape(pool.name)}">${__(
					"编辑"
				)}</button></div>`;
			});
			html += `</div>`;
		}

		$tree.html(html || `<div class="rp-empty">${__("暂无数据")}</div>`);
	};

	const load = () => {
		api("get_topology")
			.then(render_tree)
			.catch((err) => show_msg(frappe.utils.escape_html(err || __("加载失败")), "danger"));
	};

	const org_dialogs = {
		"Data Center": {
			label: __("数据中心（机房）"),
			fields: [
				{ fieldname: "data_center_name", fieldtype: "Data", label: __("名称"), reqd: 1 },
				{ fieldname: "city", fieldtype: "Data", label: __("城市") },
				{ fieldtype: "Column Break" },
				{ fieldname: "provider", fieldtype: "Data", label: __("机房供应商") },
				{ fieldname: "address", fieldtype: "Data", label: __("地址") },
			],
		},
		"Network Zone": {
			label: __("网络分区"),
			fields: [
				{ fieldname: "zone_name", fieldtype: "Data", label: __("名称"), reqd: 1 },
				{ fieldname: "data_center", fieldtype: "Link", label: __("所属数据中心"), options: "Data Center", reqd: 1 },
				{ fieldname: "zone_type", fieldtype: "Select", label: __("分区类型"), options: "\n生产\n测试\n管理\nDMZ" },
				{ fieldtype: "Column Break" },
				{ fieldname: "cidr", fieldtype: "Data", label: __("网段") },
				{ fieldname: "vlan_range", fieldtype: "Data", label: __("VLAN 范围") },
				{ fieldname: "gateway", fieldtype: "Data", label: __("网关") },
			],
		},
		Region: {
			label: __("区域"),
			fields: [
				{ fieldname: "region_name", fieldtype: "Data", label: __("名称"), reqd: 1 },
				{
					fieldname: "network_zone",
					fieldtype: "Link",
					label: __("所属网络分区"),
					options: "Network Zone",
					reqd: 1,
				},
			],
		},
	};

	const new_org = (doctype) => {
		const conf = org_dialogs[doctype];
		const d = new frappe.ui.Dialog({
			title: __("新建") + " " + conf.label,
			fields: conf.fields,
			primary_action_label: __("保存"),
			primary_action: (values) => {
				d.hide();
				api("save_org_record", { doctype: doctype, values: values })
					.then((res) => {
						show_msg(`${conf.label} ${res.label} ${__("已创建")}`, "success");
						load();
					})
					.catch((err) => show_msg(frappe.utils.escape_html(err || __("保存失败")), "danger"));
			},
		});
		d.show();
	};

	$layout.find(".rp-tree").on("click", ".rp-edit", function () {
		const name = $(this).attr("data-name");
		api("get_resource_pool", { name: name }).then((doc) => {
			form.set_values(doc);
			show_msg(__("已载入") + " " + doc.pool_name);
		});
	});

	$layout.find(".rp-save").on("click", () => {
		const values = form.get_values(true);
		if (!values.pool_name) {
			show_msg(__("请填写资源池名称"), "danger");
			return;
		}
		api("save_resource_pool", { values: values })
			.then((res) => {
				show_msg(`${__("已保存")}：${res.pool_name} (${res.name})`, "success");
				form.set_value("name", res.name);
				load();
			})
			.catch((err) => show_msg(frappe.utils.escape_html(err || __("保存失败")), "danger"));
	});

	$layout.find(".rp-reset").on("click", reset_form);

	$layout.find(".rp-delete").on("click", () => {
		const name = form.get_value("name");
		if (!name) {
			show_msg(__("请先载入要删除的资源池"), "danger");
			return;
		}
		if (!confirm(__("确认删除该资源池？"))) return;
		api("delete_record", { doctype: "Resource Pool", name: name })
			.then(() => {
				reset_form();
				load();
			})
			.catch((err) => show_msg(frappe.utils.escape_html(err || __("删除失败")), "danger"));
	});

	page.set_primary_action(__("新建资源池"), reset_form);
	page.set_secondary_action(__("刷新"), load);
	["Data Center", "Network Zone", "Region"].forEach((dt) => {
		page.add_menu_item(`${__("新建")} ${org_dialogs[dt].label}`, () => new_org(dt));
	});

	load_architectures();
	reset_form();
	load();
};
