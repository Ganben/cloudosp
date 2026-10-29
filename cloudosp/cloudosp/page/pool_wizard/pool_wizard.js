frappe.pages["pool-wizard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("云产品新增向导"),
		single_column: true,
	});
	wrapper.pool_wizard = new ProductWizard(page);
};

const PRODUCT_WIZARD_STEPS = [
	{ title: __("产品与资源池"), hint: __("产品类型、产品信息与资源池") },
	{ title: __("规格定义"), hint: __("规格参数与容量需求") },
	{ title: __("存储配置"), hint: __("系统盘 / 数据盘 / 共享存储") },
	{ title: __("计算配置"), hint: __("CPU 与内存规格") },
	{ title: __("网络配置"), hint: __("网卡/IP、EIP、CLB、NAT") },
	{ title: __("可售库存"), hint: __("型号与可售数量") },
	{ title: __("确认写入"), hint: __("写入云产品目录") },
];

const STORAGE_TYPES = ["系统盘", "数据盘", "共享存储"];
const COMPUTE_TYPES = ["CPU", "内存"];
const NETWORK_TYPES = ["私网网卡", "私网IP", "EIP", "CLB", "NAT", "其他"];

class ProductWizard {
	constructor(page) {
		this.page = page;
		this.step = 0;
		this.pool_exists = false;
		this.product_types = [];
		this.state = {
			pool: { pool_code: "", pool_name: "", region: "" },
			product: { product_code: "", product_name: "", product_type: "" },
			spec: {
				spec_code: "",
				spec_name: "",
				vcpu_count: 0,
				memory_gb: 0,
				disk_gb: 0,
				ip_count: 0,
				req_compute: 1,
				req_storage: 0,
				req_ip: 0,
				sellable_qty: 0,
				enabled: 1,
			},
			storage_items: [this.blank_storage()],
			compute_items: [this.blank_compute()],
			network_items: [this.blank_network()],
		};
		this.load_product_types();
	}

	blank_storage() {
		return {
			storage_type: "系统盘",
			storage_model: "云硬盘",
			capacity_gb: 50,
			quantity: 1,
			performance: "",
		};
	}

	blank_compute() {
		return { compute_type: "CPU", spec_model: "", quantity: 1, remark: "" };
	}

	blank_network() {
		return {
			network_type: "私网网卡",
			linked_product: "",
			binding_target: "",
			quantity: 1,
			bandwidth_mbps: 0,
			remark: "",
		};
	}

	load_product_types() {
		frappe.call({
			method: "cloudosp.utils.wizard.get_product_types",
			callback: (r) => {
				this.product_types = r.message || [];
				if (!this.state.product.product_type && this.product_types.length) {
					const preferred =
						this.product_types.find((t) => t.name === "云计算产品") || this.product_types[0];
					this.state.product.product_type = preferred.name;
				}
				this.render();
			},
		});
	}

	esc(value) {
		return frappe.utils.escape_html(String(value == null ? "" : value));
	}

	current_type() {
		return this.product_types.find((t) => t.name === this.state.product.product_type) || null;
	}

	render() {
		const step = PRODUCT_WIZARD_STEPS[this.step];
		this.page.main.html(`
			<div class="osp-wizard">
				${this.styles()}
				<div class="osp-stepper">
					${PRODUCT_WIZARD_STEPS.map(
						(s, i) => `
						<div class="osp-step ${i === this.step ? "active" : ""} ${i < this.step ? "done" : ""}">
							<div class="osp-step-no">${i < this.step ? "✓" : i + 1}</div>
							<div>
								<div class="osp-step-title">${s.title}</div>
								<div class="osp-step-hint">${s.hint}</div>
							</div>
						</div>`
					).join("")}
				</div>

				<div class="osp-panel">
					<h3 class="osp-panel-title">${step.title}</h3>
					<p class="osp-panel-desc">${step.hint}</p>
					<div id="osp-step-body">${this.step_body()}</div>
					<div class="osp-actions">
						<button class="btn btn-default btn-sm osp-prev" ${this.step === 0 ? "style='visibility:hidden'" : ""}>
							${__("上一步")}
						</button>
						<button class="btn btn-primary btn-sm osp-next">
							${this.step === PRODUCT_WIZARD_STEPS.length - 1 ? __("完成配置") : __("下一步")}
						</button>
					</div>
				</div>
			</div>
		`);
		this.bind_events();
	}

	styles() {
		return `<style>
			.osp-wizard { max-width: 1180px; }
			.osp-stepper { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
			.osp-step { flex: 1 1 150px; background: #fff; border: 1px solid #e6e9ee; border-radius: 12px; padding: 10px 13px; display: flex; gap: 9px; align-items: flex-start; transition: border-color .18s ease, box-shadow .18s ease; }
			.osp-step.active { border-color: #2490ef; box-shadow: 0 6px 18px rgba(36,144,239,.14); }
			.osp-step.done { border-color: #b9e4c9; background: #f6fdf8; }
			.osp-step-no { width: 22px; height: 22px; border-radius: 50%; background: #eef2f6; color: #6b7280; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 1px; }
			.osp-step.active .osp-step-no { background: #2490ef; color: #fff; }
			.osp-step.done .osp-step-no { background: #15803d; color: #fff; }
			.osp-step-title { font-size: 12.5px; font-weight: 600; color: #1f2733; }
			.osp-step-hint { font-size: 11px; color: #6b7280; margin-top: 1px; }
			.osp-panel { background: #fff; border: 1px solid #e6e9ee; border-radius: 14px; padding: 22px 24px; }
			.osp-panel-title { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
			.osp-panel-desc { font-size: 12.5px; color: #6b7280; margin: 0 0 18px; }
			.osp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
			.osp-field label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 5px; }
			.osp-field .req { color: #e11d48; }
			.osp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
			.osp-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; padding: 6px; border-bottom: 1px solid #eceff3; font-weight: 500; }
			.osp-table td { padding: 6px 4px; border-bottom: 1px solid #f3f5f7; vertical-align: middle; }
			.osp-table input, .osp-table select { width: 100%; }
			.osp-table .num { width: 78px; }
			.osp-actions { display: flex; justify-content: space-between; margin-top: 20px; gap: 10px; }
			.osp-hint { font-size: 12px; color: #6b7280; margin-top: 10px; line-height: 1.6; }
			.osp-hint-ok { color: #15803d; }
			.osp-remove { color: #e11d48; cursor: pointer; font-size: 14px; line-height: 1; background: none; border: none; padding: 2px 6px; }
			.osp-summary-row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f5f7; font-size: 13px; }
			.osp-summary-key { width: 140px; color: #6b7280; flex: none; }
			.osp-ok { color: #15803d; font-size: 13px; }
			.osp-chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #eef4fb; color: #173b62; font-size: 11px; margin-left: 6px; }
			.osp-guide { background: #f8fafc; border: 1px dashed #d7dee7; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #6b7280; margin-bottom: 16px; }
		</style>`;
	}

	step_body() {
		switch (this.step) {
			case 0:
				return this.render_product_step();
			case 1:
				return this.render_spec_step();
			case 2:
				return this.render_storage_step();
			case 3:
				return this.render_compute_step();
			case 4:
				return this.render_network_step();
			case 5:
				return this.render_catalog_step();
			default:
				return this.render_confirm_step();
		}
	}

	render_product_step() {
		const p = this.state.pool;
		const prod = this.state.product;
		const type = this.current_type();
		const options = this.product_types
			.map((t) => {
				const label = `${t.name}（${t.category}${t.is_base_product ? " · 基础产品" : ""}）`;
				return `<option value="${this.esc(t.name)}" ${t.name === prod.product_type ? "selected" : ""}>${this.esc(label)}</option>`;
			})
			.join("");

		return `
			<div class="osp-guide">
				${__(
					"第 1 步：先选择产品类型（云计算产品 / 基础产品），再填写产品编码与资源池。云产品最终会以「产品 + 规格」的型号形式进入云产品目录。"
				)}
			</div>
			<div class="osp-grid">
				<div class="osp-field">
					<label>${__("产品类型")} <span class="req">*</span></label>
					<select class="form-control input-sm" data-product="product_type">${options}</select>
				</div>
				<div class="osp-field">
					<label>${__("产品编码")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-product="product_code" value="${this.esc(prod.product_code)}" placeholder="ECS">
				</div>
				<div class="osp-field">
					<label>${__("产品名称")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-product="product_name" value="${this.esc(prod.product_name)}" placeholder="${__("云主机")}">
				</div>
			</div>
			${
				type
					? `<div class="osp-hint">${__("当前类型")}：<b>${this.esc(type.name)}</b>
						<span class="osp-chip">${this.esc(type.category)}</span>
						${type.is_base_product ? `<span class="osp-chip">${__("基础产品")}</span>` : ""}</div>`
					: ""
			}
			<div class="osp-grid" style="margin-top:18px;">
				<div class="osp-field">
					<label>${__("资源池编码")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-pool="pool_code" value="${this.esc(p.pool_code)}" placeholder="POOL-BJ1">
				</div>
				<div class="osp-field">
					<label>${__("资源池名称")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-pool="pool_name" value="${this.esc(p.pool_name)}" placeholder="${__("北京一区")}">
				</div>
				<div class="osp-field">
					<label>${__("区域")}</label>
					<input class="form-control input-sm" data-pool="region" value="${this.esc(p.region)}" placeholder="${__("华北")}">
				</div>
			</div>
			<div class="osp-hint" id="osp-pool-hint">${__(
				"输入已有资源池编码将复用并更新该资源池，否则新建。"
			)}</div>
		`;
	}

	render_spec_step() {
		const s = this.state.spec;
		return `
			<div class="osp-guide">${__(
				"第 2 步：定义规格参数与容量需求。容量需求用于把「产品清单」换算成资源池 AZ 容量池的占用量。"
			)}</div>
			<div class="osp-grid">
				<div class="osp-field">
					<label>${__("规格编码")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-spec="spec_code" value="${this.esc(s.spec_code)}" placeholder="ECS-4C8G">
				</div>
				<div class="osp-field">
					<label>${__("规格名称")} <span class="req">*</span></label>
					<input class="form-control input-sm" data-spec="spec_name" value="${this.esc(s.spec_name)}" placeholder="4核8G">
				</div>
				<div class="osp-field">
					<label>vCPU</label>
					<input type="number" class="form-control input-sm" data-spec="vcpu_count" value="${s.vcpu_count}">
				</div>
				<div class="osp-field">
					<label>${__("内存（GB）")}</label>
					<input type="number" class="form-control input-sm" data-spec="memory_gb" value="${s.memory_gb}">
				</div>
				<div class="osp-field">
					<label>${__("磁盘（GB）")}</label>
					<input type="number" class="form-control input-sm" data-spec="disk_gb" value="${s.disk_gb}">
				</div>
				<div class="osp-field">
					<label>${__("IP（个）")}</label>
					<input type="number" class="form-control input-sm" data-spec="ip_count" value="${s.ip_count}">
				</div>
			</div>
			<h4 style="margin:20px 0 8px;font-size:13px;">${__("容量需求（每售出 1 个型号的占用量）")}</h4>
			<div class="osp-grid">
				<div class="osp-field">
					<label>${__("计算消耗")} <span class="req">*</span></label>
					<input type="number" class="form-control input-sm" data-spec="req_compute" value="${s.req_compute}">
				</div>
				<div class="osp-field">
					<label>${__("存储消耗")}</label>
					<input type="number" class="form-control input-sm" data-spec="req_storage" value="${s.req_storage}">
				</div>
				<div class="osp-field">
					<label>${__("IP 消耗")}</label>
					<input type="number" class="form-control input-sm" data-spec="req_ip" value="${s.req_ip}">
				</div>
			</div>
			<div class="osp-hint">${__(
				"至少填写一项容量消耗；基础产品（如 EIP）可只填 IP 消耗。"
			)}</div>
		`;
	}

	render_storage_step() {
		const rows = this.state.storage_items
			.map(
				(row, i) => `
			<tr data-idx="${i}">
				<td>
					<select class="form-control input-xs" data-storage="storage_type">
						${STORAGE_TYPES.map(
							(t) => `<option ${t === row.storage_type ? "selected" : ""}>${t}</option>`
						).join("")}
					</select>
				</td>
				<td>
					<select class="form-control input-xs" data-storage="storage_model">
						<option ${row.storage_model === "云硬盘" ? "selected" : ""}>云硬盘</option>
						<option ${row.storage_model === "对象存储" ? "selected" : ""}>对象存储</option>
					</select>
				</td>
				<td><input type="number" class="form-control input-xs num" data-storage="capacity_gb" value="${row.capacity_gb}"></td>
				<td><input type="number" class="form-control input-xs num" data-storage="quantity" value="${row.quantity}"></td>
				<td><input class="form-control input-xs" data-storage="performance" value="${this.esc(row.performance)}" placeholder="${__("如 SSD 高IO")}"></td>
				<td><button class="osp-remove" data-remove-storage="${i}">✕</button></td>
			</tr>`
			)
			.join("");

		return `
			<div class="osp-guide">${__(
				"第 3 步：配置存储资源。系统盘与数据盘使用云硬盘，共享存储使用对象存储；基础存储产品可只保留一行。"
			)}</div>
			<table class="osp-table">
				<thead>
					<tr>
						<th>${__("存储类型")} *</th>
						<th>${__("存储型号")} *</th>
						<th>${__("容量（GB）")} *</th>
						<th>${__("数量")}</th>
						<th>${__("性能/说明")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody id="osp-storage-rows">${rows}</tbody>
			</table>
			<button class="btn btn-default btn-xs" id="osp-add-storage" style="margin-top:12px;">+ ${__("添加存储")}</button>
		`;
	}

	render_compute_step() {
		const rows = this.state.compute_items
			.map(
				(row, i) => `
			<tr data-idx="${i}">
				<td>
					<select class="form-control input-xs" data-compute="compute_type">
						${COMPUTE_TYPES.map(
							(t) => `<option ${t === row.compute_type ? "selected" : ""}>${t}</option>`
						).join("")}
					</select>
				</td>
				<td><input class="form-control input-xs" data-compute="spec_model" value="${this.esc(row.spec_model)}" placeholder="${__("如 Intel Xeon 8核 / 16GB DDR4")}"></td>
				<td><input type="number" class="form-control input-xs num" data-compute="quantity" value="${row.quantity}"></td>
				<td><input class="form-control input-xs" data-compute="remark" value="${this.esc(row.remark)}"></td>
				<td><button class="osp-remove" data-remove-compute="${i}">✕</button></td>
			</tr>`
			)
			.join("");

		return `
			<div class="osp-guide">${__(
				"第 4 步：配置计算资源（CPU 规格、内存规格）。基础产品（云硬盘、EIP 等）可跳过此步。"
			)}</div>
			<table class="osp-table">
				<thead>
					<tr>
						<th>${__("计算类型")} *</th>
						<th>${__("规格型号/参数")} *</th>
						<th>${__("数量")}</th>
						<th>${__("说明")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody id="osp-compute-rows">${rows}</tbody>
			</table>
			<button class="btn btn-default btn-xs" id="osp-add-compute" style="margin-top:12px;">+ ${__("添加计算资源")}</button>
		`;
	}

	render_network_step() {
		const rows = this.state.network_items
			.map(
				(row, i) => `
			<tr data-idx="${i}">
				<td>
					<select class="form-control input-xs" data-network="network_type">
						${NETWORK_TYPES.map(
							(t) => `<option ${t === row.network_type ? "selected" : ""}>${t}</option>`
						).join("")}
					</select>
				</td>
				<td><input class="form-control input-xs" data-network="linked_product" value="${this.esc(row.linked_product)}" placeholder="${__("产品编码，如 EIP")}"></td>
				<td><input class="form-control input-xs" data-network="binding_target" value="${this.esc(row.binding_target)}" placeholder="${__("如绑定的 ECS / CLB 后端")}"></td>
				<td><input type="number" class="form-control input-xs num" data-network="quantity" value="${row.quantity}"></td>
				<td><input type="number" class="form-control input-xs num" data-network="bandwidth_mbps" value="${row.bandwidth_mbps}"></td>
				<td><input class="form-control input-xs" data-network="remark" value="${this.esc(row.remark)}"></td>
				<td><button class="osp-remove" data-remove-network="${i}">✕</button></td>
			</tr>`
			)
			.join("");

		return `
			<div class="osp-guide">${__(
				"第 5 步：配置网络资源。私网网卡/IP 描述内网接入；EIP、CLB、NAT 可作为关联云产品并记录绑定/关联对象。"
			)}</div>
			<table class="osp-table">
				<thead>
					<tr>
						<th>${__("网络类型")} *</th>
						<th>${__("关联云产品")}</th>
						<th>${__("绑定/关联对象")}</th>
						<th>${__("数量")}</th>
						<th>${__("带宽(Mbps)")}</th>
						<th>${__("说明")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody id="osp-network-rows">${rows}</tbody>
			</table>
			<button class="btn btn-default btn-xs" id="osp-add-network" style="margin-top:12px;">+ ${__("添加网络资源")}</button>
		`;
	}

	render_catalog_step() {
		const s = this.state.spec;
		const product = this.state.product;
		return `
			<div class="osp-guide">${__(
				"第 6 步：确认型号与可售数量。型号 = 云产品 + 规格，将写入云产品目录并展示在网站首页。"
			)}</div>
			<div class="osp-summary-row">
				<div class="osp-summary-key">${__("型号")}</div>
				<div><strong>${this.esc(product.product_name || product.product_code || "-")} / ${this.esc(
			s.spec_name || s.spec_code || "-"
		)}</strong></div>
			</div>
			<div class="osp-grid" style="margin-top:14px;">
				<div class="osp-field">
					<label>${__("可售数量")} <span class="req">*</span></label>
					<input type="number" class="form-control input-sm" data-catalog="sellable_qty" value="${s.sellable_qty}">
				</div>
				<div class="osp-field">
					<label>${__("上架到首页目录")}</label>
					<div><input type="checkbox" data-catalog="enabled" ${s.enabled ? "checked" : ""}></div>
				</div>
			</div>
		`;
	}

	render_confirm_step() {
		const t = this.current_type();
		const s = this.state.spec;
		const storage = this.state.storage_items
			.filter((r) => r.capacity_gb > 0)
			.map(
				(r) =>
					`<div class="osp-summary-row"><div class="osp-summary-key">${__("存储")}</div><div>${this.esc(
						r.storage_type
					)} · ${this.esc(r.storage_model)} · ${r.capacity_gb}GB × ${r.quantity}</div></div>`
			)
			.join("");
		const compute = this.state.compute_items
			.filter((r) => r.spec_model)
			.map(
				(r) =>
					`<div class="osp-summary-row"><div class="osp-summary-key">${__("计算")}</div><div>${this.esc(
						r.compute_type
					)} · ${this.esc(r.spec_model)} × ${r.quantity}</div></div>`
			)
			.join("");
		const network = this.state.network_items
			.map(
				(r) =>
					`<div class="osp-summary-row"><div class="osp-summary-key">${__("网络")}</div><div>${this.esc(
						r.network_type
					)}${r.linked_product ? " · " + this.esc(r.linked_product) : ""}${
						r.binding_target ? " · " + this.esc(r.binding_target) : ""
					} × ${r.quantity}${r.bandwidth_mbps ? ` · ${r.bandwidth_mbps}Mbps` : ""}</div></div>`
			)
			.join("");

		return `
			<div class="osp-summary-row">
				<div class="osp-summary-key">${__("资源池")}</div>
				<div><strong>${this.esc(this.state.pool.pool_code)}</strong> · ${this.esc(
			this.state.pool.pool_name
		)}${this.state.pool.region ? " · " + this.esc(this.state.pool.region) : ""}
					${this.pool_exists ? `<span class="osp-ok">（${__("已存在，将更新")}）</span>` : ""}
				</div>
			</div>
			<div class="osp-summary-row">
				<div class="osp-summary-key">${__("产品")}</div>
				<div><strong>${this.esc(this.state.product.product_code)}</strong> · ${this.esc(
			this.state.product.product_name
		)} <span class="osp-chip">${this.esc(t ? t.name : "")}</span></div>
			</div>
			<div class="osp-summary-row">
				<div class="osp-summary-key">${__("规格")}</div>
				<div><strong>${this.esc(s.spec_code)}</strong> · ${this.esc(s.spec_name)}（${__("计算消耗")} ${s.req_compute}
					/ ${__("存储消耗")} ${s.req_storage} / ${__("IP 消耗")} ${s.req_ip}）</div>
			</div>
			${storage}${compute}${network}
			<div class="osp-summary-row">
				<div class="osp-summary-key">${__("可售数量")}</div>
				<div><strong>${s.sellable_qty}</strong>${s.enabled ? "" : ` · <span class="text-muted">${__("不上架")}</span>`}</div>
			</div>
			<div class="osp-hint" id="osp-finish-hint">${__(
				"确认后将以事务方式创建/更新资源池、云产品、规格（含存储/计算/网络配置），并写入云产品目录。"
			)}</div>
		`;
	}

	bind_events() {
		const $body = this.page.main;
		$body.find(".osp-next").on("click", () => this.next());
		$body.find(".osp-prev").on("click", () => this.prev());

		$body.find("[data-pool]").on("change blur", (e) => {
			const field = e.currentTarget.dataset.pool;
			this.state.pool[field] = e.currentTarget.value.trim();
			if (field === "pool_code") this.check_pool(e.currentTarget.value.trim());
		});

		$body.find("[data-product]").on("change blur", (e) => {
			const field = e.currentTarget.dataset.product;
			this.state.product[field] = e.currentTarget.value.trim();
			if (field === "product_type") {
				this.state.product.product_type = e.currentTarget.value;
				if (this.step === 0) this.render();
			}
		});

		$body.find("[data-spec]").on("change blur", (e) => {
			const field = e.currentTarget.dataset.spec;
			this.state.spec[field] = REGULAR_NUMERIC_SPEC_FIELDS.includes(field)
				? frappe.utils.flt(e.currentTarget.value)
				: e.currentTarget.value.trim();
		});

		$body.find("[data-catalog]").on("change blur", (e) => {
			const field = e.currentTarget.dataset.catalog;
			if (field === "enabled") this.state.spec.enabled = e.currentTarget.checked ? 1 : 0;
			else this.state.spec.sellable_qty = frappe.utils.flt(e.currentTarget.value);
		});

		this.bind_rows($body, "storage", "storage_items", () => this.blank_storage(), "add-storage", "remove-storage", [
			"capacity_gb",
			"quantity",
		]);
		this.bind_rows($body, "compute", "compute_items", () => this.blank_compute(), "add-compute", "remove-compute", [
			"quantity",
		]);
		this.bind_rows($body, "network", "network_items", () => this.blank_network(), "add-network", "remove-network", [
			"quantity",
			"bandwidth_mbps",
		]);

		// 存储类型与型号联动
		$body.find('[data-storage="storage_type"]').on("change", (e) => {
			const idx = Number(e.currentTarget.closest("tr").dataset.idx);
			const type = e.currentTarget.value;
			const model = type === "共享存储" ? "对象存储" : "云硬盘";
			this.state.storage_items[idx].storage_type = type;
			this.state.storage_items[idx].storage_model = model;
			const $row = e.currentTarget.closest("tr");
			$row.find('[data-storage="storage_model"]').val(model);
		});
	}

	bind_rows($body, data_key, state_key, blank, add_id, remove_key, numeric_fields) {
		$body.find(`[data-${data_key}]`).on("change blur", (e) => {
			const idx = Number(e.currentTarget.closest("tr").dataset.idx);
			const field = e.currentTarget.dataset[data_key];
			if (field === "storage_type" || field === "storage_model") return;
			this.state[state_key][idx][field] = numeric_fields.includes(field)
				? frappe.utils.flt(e.currentTarget.value)
				: e.currentTarget.value.trim();
		});

		$body.find(`#osp-${add_id}`).on("click", () => {
			this.collect_current_step();
			this.state[state_key].push(blank());
			this.render();
		});

		$body.find(`[data-${remove_key}]`).on("click", (e) => {
			this.collect_current_step();
			const idx = Number(e.currentTarget.dataset[remove_key]);
			this.state[state_key].splice(idx, 1);
			this.render();
		});
	}

	collect_current_step() {
		const $body = this.page.main;
		if (this.step === 0) {
			$body.find("[data-pool]").each((i, el) => {
				this.state.pool[el.dataset.pool] = el.value.trim();
			});
			$body.find("[data-product]").each((i, el) => {
				this.state.product[el.dataset.product] = el.value.trim();
			});
		} else if (this.step === 1) {
			$body.find("[data-spec]").each((i, el) => {
				const field = el.dataset.spec;
				this.state.spec[field] = REGULAR_NUMERIC_SPEC_FIELDS.includes(field)
					? frappe.utils.flt(el.value)
					: el.value.trim();
			});
		} else if (this.step === 5) {
			$body.find("[data-catalog]").each((i, el) => {
				if (el.dataset.catalog === "enabled") this.state.spec.enabled = el.checked ? 1 : 0;
				else this.state.spec.sellable_qty = frappe.utils.flt(el.value);
			});
		}
	}

	check_pool(pool_code) {
		const $hint = this.page.main.find("#osp-pool-hint");
		if (!pool_code) return;
		frappe.call({
			method: "cloudosp.utils.wizard.get_pool_context",
			args: { pool_code: pool_code },
			callback: (r) => {
				const data = r.message || {};
				this.pool_exists = !!data.exists;
				if (!data.exists) {
					$hint.removeClass("osp-hint-ok").text(__("新资源池，将创建。"));
					return;
				}
				const p = data.pool || {};
				if (p.pool_name && !this.state.pool.pool_name) {
					this.state.pool.pool_name = p.pool_name;
					this.page.main.find('[data-pool="pool_name"]').val(p.pool_name);
				}
				if (p.region && !this.state.pool.region) {
					this.state.pool.region = p.region;
					this.page.main.find('[data-pool="region"]').val(p.region);
				}
				$hint
					.addClass("osp-hint-ok")
					.text(
						__("资源池已存在：{0} 个云产品、{1} 个规格、{2} 个目录条目，将更新配置。", [
							data.products.length,
							data.specs.length,
							data.catalog_items.length,
						])
					);
			},
		});
	}

	next() {
		this.collect_current_step();
		const error = this.validate_step();
		if (error) {
			frappe.msgprint({ title: __("请检查输入"), message: error, indicator: "red" });
			return;
		}
		if (this.step === PRODUCT_WIZARD_STEPS.length - 1) {
			this.submit();
			return;
		}
		this.step += 1;
		this.render();
	}

	prev() {
		this.collect_current_step();
		if (this.step > 0) {
			this.step -= 1;
			this.render();
		}
	}

	validate_step() {
		const s = this.state.spec;
		if (this.step === 0) {
			if (!this.state.product.product_type) return __("请选择产品类型");
			if (!this.state.product.product_code) return __("请填写产品编码");
			if (!this.state.product.product_name) return __("请填写产品名称");
			if (!this.state.pool.pool_code) return __("请填写资源池编码");
			if (!this.state.pool.pool_name) return __("请填写资源池名称");
			return null;
		}
		if (this.step === 1) {
			if (!s.spec_code) return __("请填写规格编码");
			if (!s.spec_name) return __("请填写规格名称");
			if (!s.req_compute && !s.req_storage && !s.req_ip) {
				return __("请至少填写一项容量消耗");
			}
			return null;
		}
		if (this.step === 2) {
			const invalid = this.state.storage_items.findIndex((r) => !r.capacity_gb || r.capacity_gb <= 0);
			return invalid >= 0 ? __("第 {0} 行：存储容量必须大于 0", [invalid + 1]) : null;
		}
		if (this.step === 3) {
			const invalid = this.state.compute_items.findIndex((r) => !r.spec_model);
			return invalid >= 0 ? __("第 {0} 行：请填写计算规格型号", [invalid + 1]) : null;
		}
		if (this.step === 4) {
			const invalid = this.state.network_items.findIndex((r) => !r.quantity || r.quantity <= 0);
			return invalid >= 0 ? __("第 {0} 行：网络资源数量必须大于 0", [invalid + 1]) : null;
		}
		if (this.step === 5) {
			return s.sellable_qty < 0 ? __("可售数量不能为负数") : null;
		}
		return null;
	}

	build_payload() {
		const s = this.state.spec;
		return {
			pool: this.state.pool,
			product: this.state.product,
			spec: {
				spec_code: s.spec_code,
				spec_name: s.spec_name,
				vcpu_count: s.vcpu_count,
				memory_gb: s.memory_gb,
				disk_gb: s.disk_gb,
				ip_count: s.ip_count,
				requirements: { 计算: s.req_compute, 存储: s.req_storage, IP: s.req_ip },
				storage_items: this.state.storage_items.filter((r) => r.capacity_gb > 0),
				compute_items: this.state.compute_items.filter((r) => r.spec_model),
				network_items: this.state.network_items.filter((r) => r.quantity > 0),
			},
			catalog: { sellable_qty: s.sellable_qty, enabled: s.enabled },
		};
	}

	submit() {
		const $btn = this.page.main.find(".osp-next");
		$btn.prop("disabled", true).text(__("正在写入..."));

		frappe.call({
			method: "cloudosp.utils.wizard.create_configuration",
			args: { payload: JSON.stringify(this.build_payload()) },
			freeze: true,
			callback: (r) => {
				if (r.exc) {
					$btn.prop("disabled", false).text(__("完成配置"));
					return;
				}
				const msg = r.message || {};
				this.page.main.find("#osp-step-body").html(`
					<div style="text-align:center;padding:26px 0;">
						<div style="font-size:40px;line-height:1;color:#15803d;">✓</div>
						<h3 style="margin:14px 0 6px;">${__("产品已写入云产品目录")}</h3>
						<p style="color:#6b7280;font-size:13px;">
							${__("资源池")}：<strong>${this.esc(msg.pool || "")}</strong> ·
							${__("云产品")}：<strong>${this.esc(msg.product || "")}</strong> ·
							${__("规格")}：<strong>${this.esc(msg.spec || "")}</strong> ·
							${__("目录条目")}：<strong>${this.esc(msg.catalog_item || "")}</strong>
						</p>
						<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
							<a class="btn btn-default btn-sm" href="/app/catalog-item">${__("查看云产品目录")}</a>
							<a class="btn btn-default btn-sm" href="/app/resource-spec">${__("查看规格配置")}</a>
							<a class="btn btn-default btn-sm" href="/">${__("返回首页看板")}</a>
							<button class="btn btn-primary btn-sm" id="osp-restart">${__("继续新增")}</button>
						</div>
					</div>
				`);
				this.page.main.find(".osp-actions").hide();
				this.page.main.find("#osp-restart").on("click", () => {
					this.step = 0;
					this.state = {
						pool: { pool_code: "", pool_name: "", region: "" },
						product: { product_code: "", product_name: "", product_type: "" },
						spec: {
							spec_code: "",
							spec_name: "",
							vcpu_count: 0,
							memory_gb: 0,
							disk_gb: 0,
							ip_count: 0,
							req_compute: 1,
							req_storage: 0,
							req_ip: 0,
							sellable_qty: 0,
							enabled: 1,
						},
						storage_items: [this.blank_storage()],
						compute_items: [this.blank_compute()],
						network_items: [this.blank_network()],
					};
					this.render();
				});
				frappe.show_alert({ message: __("产品配置完成"), indicator: "green" });
			},
		});
	}
}

const REGULAR_NUMERIC_SPEC_FIELDS = [
	"vcpu_count",
	"memory_gb",
	"disk_gb",
	"ip_count",
	"req_compute",
	"req_storage",
	"req_ip",
];
