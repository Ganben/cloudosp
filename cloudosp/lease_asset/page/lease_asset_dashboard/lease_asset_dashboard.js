frappe.pages["lease-asset-dashboard"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.dashboard_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("资产租赁仪表盘"),
		single_column: true,
	});

	$(`<style>
		.la-overview { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
		.la-overview-card { flex: 1 1 320px; background: var(--fg-color); border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md); padding: 14px 16px; }
		.la-overview-card h6 { margin: 0 0 10px; font-weight: 600; }
		.la-dim { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
		.la-dim-label { color: var(--text-muted); }
		.la-dim-value { font-weight: 600; }
		.la-dash { display: flex; gap: 20px; align-items: flex-start; }
		.la-dash-side { flex: 0 0 340px; }
		.la-dash-main { flex: 1 1 auto; min-width: 0; }
		.la-card-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.la-panel-title { margin: 0 0 12px; font-weight: 600; }
		.la-tree { font-size: 13px; line-height: 1.6; }
		.la-dc { margin-bottom: 12px; padding-left: 6px; border-left: 3px solid var(--blue-500); }
		.la-zone { margin: 5px 0 5px 14px; padding-left: 6px; border-left: 3px solid var(--cyan-500); }
		.la-region { margin: 3px 0 3px 14px; padding-left: 6px; border-left: 3px solid var(--green-500); }
		.la-pool { margin: 2px 0 2px 14px; padding: 2px 6px; border-left: 3px solid var(--gray-400); cursor: pointer; }
		.la-pool:hover { background: var(--control-bg); }
		.la-pool.la-active { background: var(--control-bg); border-left-color: var(--blue-500); font-weight: 600; }
		.la-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.la-capacity { display: flex; gap: 16px; flex-wrap: wrap; }
		.la-cap-block { flex: 1 1 180px; border: 1px solid var(--border-color); border-radius: var(--border-radius-md);
			padding: 10px 12px; }
		.la-cap-title { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
		.la-level { display: inline-block; width: 70px; height: 6px; background: var(--control-bg);
			border-radius: 3px; vertical-align: middle; margin-right: 6px; }
		.la-level > i { display: block; height: 6px; background: var(--blue-500); border-radius: 3px; }
		.la-stats { display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0; }
		.la-stat { flex: 1 1 120px; min-width: 110px; border: 1px solid var(--border-color);
			border-radius: var(--border-radius-md); padding: 10px 12px; }
		.la-stat-value { font-size: 20px; font-weight: 600; }
		.la-stat-label { font-size: 12px; color: var(--text-muted); }
		.la-empty { color: var(--text-muted); font-size: 12px; padding: 8px 0; }
	</style>`).appendTo(page.main);

	const $layout = $(`
		<div>
			<div class="la-overview"></div>
			<div class="la-dash">
				<div class="la-dash-side la-card-panel">
					<h6 class="la-panel-title">${__("资源池拓扑")}</h6>
					<div class="la-tree"></div>
				</div>
				<div class="la-dash-main la-card-panel">
					<ul class="nav nav-tabs la-tabs">
						<li class="nav-item"><a class="nav-link active" href="#" data-tab="sold">${__("已售")}</a></li>
						<li class="nav-item"><a class="nav-link" href="#" data-tab="asset">${__("资产")}</a></li>
					</ul>
					<div class="la-pool-capacity mt-3"></div>
					<div class="la-context small text-muted"></div>
					<div class="la-stats"></div>
					<div class="la-list"></div>
				</div>
			</div>
		</div>
	`).appendTo(page.main);

	const $tree = $layout.find(".la-tree");
	const $stats = $layout.find(".la-stats");
	const $list = $layout.find(".la-list");
	const $context = $layout.find(".la-context");
	const $capacity = $layout.find(".la-pool-capacity");
	const $overview = $layout.find(".la-overview");

	const state = { tab: "sold", pool: null, data: null };
	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");
	const num = (val) => {
		const n = Number(val || 0);
		return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
	};
	const with_unit = (val, unit) => `${esc(num(val))} ${esc(unit)}`;

	const dim_row = (dim) =>
		`<div class="la-dim"><span class="la-dim-label">${esc(dim.label)}</span>
			<span class="la-dim-value">${with_unit(dim.total, dim.unit)}</span></div>`;

	const render_overview = (overview) => {
		if (!overview) return;
		const available_card = `<div class="la-overview-card">
			<h6>${__("总可售容量")}</h6>
			${overview.dimensions
				.map(
					(dim) =>
						`<div class="la-dim"><span class="la-dim-label">${esc(dim.label)}</span>
							<span class="la-dim-value">${with_unit(dim.available, dim.unit)}</span></div>`
				)
				.join("")}
		</div>`;

		$overview.html(
			`<div class="la-overview-card">
				<h6>${__("总资源池容量")}</h6>
				${overview.dimensions.map(dim_row).join("")}
			</div>
			${available_card}
			<div class="la-overview-card">
				<h6>${__("资源池数量")}</h6>
				<div class="la-dim"><span class="la-dim-label">${__("资源池")}</span>
					<span class="la-dim-value">${esc(overview.pool_count)}</span></div>
			</div>`
		);
	};

	const render_capacity = (data) => {
		if (!data) {
			$capacity.html("");
			return;
		}
		const total_block = `<div class="la-cap-block">
			<div class="la-cap-title">${__("总容量")}</div>
			${data.dimensions
				.map(
					(dim) =>
						`<div class="la-dim"><span class="la-dim-label">${esc(dim.label)}</span>
							<span class="la-dim-value">${with_unit(dim.total, dim.unit)}</span></div>`
				)
				.join("")}
		</div>`;

		const level_block = `<div class="la-cap-block">
			<div class="la-cap-title">${__("水位")}</div>
			${data.dimensions
				.map(
					(dim) =>
						`<div class="la-dim"><span class="la-dim-label">${esc(dim.label)}</span>
							<span class="la-dim-value">
								<span class="la-level"><i style="width:${Math.min(dim.level, 100)}%"></i></span>
								${esc(dim.level)}%
								<span class="la-tag">${esc(num(dim.used))}/${esc(num(dim.total))}</span>
							</span></div>`
				)
				.join("")}
		</div>`;

		const available_block = `<div class="la-cap-block">
			<div class="la-cap-title">${__("可售容量")}</div>
			${data.dimensions
				.map(
					(dim) =>
						`<div class="la-dim"><span class="la-dim-label">${esc(dim.label)}</span>
							<span class="la-dim-value">${with_unit(dim.available, dim.unit)}</span></div>`
				)
				.join("")}
		</div>`;

		$capacity.html(`<div class="la-capacity">${total_block}${level_block}${available_block}</div>`);
	};

	const render_tree = (topology) => {
		let html = "";
		topology.data_centers.forEach((dc) => {
			html += `<div class="la-dc"><b>${esc(dc.label)}</b><span class="la-tag">${esc(dc.city || "")}</span>`;
			dc.zones.forEach((zone) => {
				html += `<div class="la-zone"><b>${esc(zone.label)}</b>`;
				zone.regions.forEach((region) => {
					html += `<div class="la-region"><b>${esc(region.label)}</b>`;
					if (!region.pools.length) {
						html += `<div class="la-empty">${__("暂无资源池")}</div>`;
					}
					region.pools.forEach((pool) => {
						html += `<div class="la-pool" data-pool="${esc(pool.name)}">${esc(pool.pool_name)}
							<span class="la-tag">${esc(pool.architecture)} · ${esc(pool.pool_type || "")}</span></div>`;
					});
					html += `</div>`;
				});
				html += `</div>`;
			});
			html += `</div>`;
		});
		html += topology.unassigned_pools && topology.unassigned_pools.length
			? `<div class="la-empty">${__("未分配区域的资源池")}：${topology.unassigned_pools.length}</div>`
			: "";
		$tree.html(html || `<div class="la-empty">${__("暂无数据")}</div>`);
	};

	const stat = (label, value) =>
		`<div class="la-stat"><div class="la-stat-value">${esc(value)}</div><div class="la-stat-label">${esc(
			label
		)}</div></div>`;

	const render_sold = (data) => {
		const s = data.stats;
		let html = stat(__("已售云主机"), s.total) + stat(__("客户数"), s.customers) + stat(__("在用"), s.in_service);
		for (const key of Object.keys(s.by_status || {})) {
			html += stat(key, s.by_status[key]);
		}
		html += stat(__("关联应用"), s.applications);
		$stats.html(html);

		if (!data.rows.length) {
			$list.html(`<div class="la-empty">${__("该资源池暂无已售云主机")}</div>`);
			return;
		}

		let table = `<table class="table table-bordered table-sm">
			<thead class="thead-light"><tr>
				<th>${__("单号")}</th><th>${__("资产名称")}</th><th>${__("客户")}</th>
				<th>${__("服务状态")}</th><th>${__("起租")}</th><th>${__("退租")}</th>
				<th>${__("租赁订单")}</th><th class="text-right">${__("应用数")}</th>
			</tr></thead><tbody>`;
		data.rows.forEach((row) => {
			table += `<tr>
				<td>${esc(row.name)}</td>
				<td>${esc(row.asset_name)}</td>
				<td>${esc(row.customer_name || row.customer || "")}</td>
				<td>${esc(row.service_status || "")}</td>
				<td>${esc(row.start_date || "")}</td>
				<td>${esc(row.end_date || "")}</td>
				<td>${esc(row.lease_order || "")}</td>
				<td class="text-right">${esc(row.app_count)}</td>
			</tr>`;
		});
		table += `</tbody></table>`;
		$list.html(table);
	};

	const render_asset = (data) => {
		const s = data.stats;
		let html = stat(__("物理机台数"), s.total) + stat(__("已分配给客户"), s.assigned);
		for (const key of Object.keys(s.by_status || {})) {
			html += stat(`${__("状态")}：${key}`, s.by_status[key]);
		}
		for (const key of Object.keys(s.by_category || {})) {
			html += stat(`${__("类别")}：${key}`, s.by_category[key]);
		}
		$stats.html(html);

		if (!data.rows.length) {
			$list.html(`<div class="la-empty">${__("该资源池暂无关联物理机")}</div>`);
			return;
		}

		let table = `<table class="table table-bordered table-sm">
			<thead class="thead-light"><tr>
				<th>${__("资产编号")}</th><th>${__("资产名称")}</th><th>${__("类别")}</th>
				<th>${__("位置")}</th><th>${__("状态")}</th><th>${__("公司")}</th>
				<th>${__("购置日期")}</th><th>${__("关联租赁资产 / 客户")}</th>
			</tr></thead><tbody>`;
		data.rows.forEach((row) => {
			const linked = (row.linked || [])
				.map(
					(item) =>
						`${esc(item.lease_asset_name)}<span class="la-tag">${esc(item.customer_name || "")} · ${esc(
							item.source
						)}</span>`
				)
				.join("<br>");
			table += `<tr>
				<td>${esc(row.name)}</td>
				<td>${esc(row.asset_name)}</td>
				<td>${esc(row.asset_category || "")}</td>
				<td>${esc(row.location || "")}</td>
				<td>${esc(row.status || "")}</td>
				<td>${esc(row.company || "")}</td>
				<td>${esc(row.purchase_date || "")}</td>
				<td>${linked || `<span class="la-tag">${__("未分配")}</span>`}</td>
			</tr>`;
		});
		table += `</tbody></table>`;
		$list.html(table);
	};

	const load_capacity = () => {
		if (!state.pool) {
			render_capacity(null);
			return;
		}
		api("get_pool_capacity", { pool: state.pool })
			.then(render_capacity)
			.catch(() => render_capacity(null));
	};

	const load_detail = () => {
		if (!state.pool) {
			$context.html(__("请点击左侧资源池"));
			$stats.html("");
			$list.html("");
			return;
		}
		const method = state.tab === "sold" ? "get_sold_summary" : "get_asset_summary";
		$list.html(`<div class="la-empty">${__("加载中")}...</div>`);
		api(method, { pool: state.pool })
			.then((res) => {
				$context.html(
					`${__("资源池")}：<b>${esc(res.pool_name)}</b> <span class="la-tag">${esc(res.pool)}</span> · ${
						state.tab === "sold" ? __("已售云主机") : __("关联物理机")
					}`
				);
				state.tab === "sold" ? render_sold(res) : render_asset(res);
			})
			.catch((err) => {
				$list.html(`<div class="la-empty">${esc(err || __("加载失败"))}</div>`);
			});
	};

	$layout.find(".la-tabs .nav-link").on("click", function (e) {
		e.preventDefault();
		state.tab = $(this).attr("data-tab");
		$layout.find(".la-tabs .nav-link").removeClass("active");
		$(this).addClass("active");
		load_detail();
	});

	$layout.find(".la-tree").on("click", ".la-pool", function () {
		state.pool = $(this).attr("data-pool");
		$layout.find(".la-pool").removeClass("la-active");
		$(this).addClass("la-active");
		load_capacity();
		load_detail();
	});

	const load = () => {
		api("get_dashboard_data")
			.then((res) => {
				state.data = res;
				render_tree(res.topology);
				render_overview(res.overview);
			})
			.catch((err) => $tree.html(`<div class="la-empty">${esc(err || __("加载失败"))}</div>`));
	};

	page.set_primary_action(__("刷新"), load);

	load();
	load_detail();
};
