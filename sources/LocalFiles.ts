import * as fs from "fs-extra";
import * as filepath from "path";

import getFileType from "./filetypes";
import {CombinedPolicy, ForceRootPolicy} from "./policy";
import {IDriveConfig, IFsObject, IListConfig, IOperationConfig, IPolicy, Operation} from "./types";

const isWindows = filepath.sep === "\\";

export default class LocalFiles {
	private policy: IPolicy;
	private _root: string;
	private _config: IDriveConfig;

	constructor(root: string, policy?: IPolicy, config?:IDriveConfig){
		if (!root ||
			(!isWindows && root[0] !== "/") ||
			(isWindows && !/^[A-Z]:\\/i.test(root))){
				// expect full path from the drive root
				// it is necessary to ensure ForceRoot policy
				throw new Error("Invalid root folder");
			}

		// /some/path/ => /some/path
		if (root[root.length-1] === filepath.sep) {
			root = root.substr(0, root.length-1);
		}
		// /root/some/../../other => /root/other
		this._root = filepath.normalize(root);

		if (!policy) {
			this.policy = new ForceRootPolicy(this._root);
		}else {
			this.policy = new CombinedPolicy(
				new ForceRootPolicy(this._root),
				policy
			);
		}

		this._config = config || {};
	}

	async list(path: string, config?: IListConfig) : Promise<IFsObject[]> {
		config = config || {};

		if (this._config.verbose){
			console.log("List %s", path);
			console.log("with config ", config);
		}

		const fullpath = this.idToPath(path);

		if (this.policy.comply(fullpath, Operation.Read)) {
			return this._listFolder(fullpath, path, config, null);
		}
		throw new Error("Access Denied");
	}

	async search(path: string, search: string, config?: IListConfig) : Promise<IFsObject[]> {
		return this.list(path, config)
	}

	async remove(path: string): Promise<void>{
		if (this._config.verbose){
			console.log("Delete %s", path);
		}

		const fullpath = this.idToPath(path);
		if (this.policy.comply(fullpath, Operation.Write)) {
			return fs.remove(fullpath);
		}

		throw new Error("Access Denied");
	}

	async read(path: string): Promise<fs.ReadStream> {
		if (this._config.verbose){
			console.log("Get content of %s", path);
		}

		const fullpath = this.idToPath(path);
		if (this.policy.comply(fullpath, Operation.Read)) {
			return fs.createReadStream(fullpath);
		}

		throw new Error("Access Denied");
	}

	async write(path: string, data: fs.ReadStream): Promise<string> {
		if (this._config.verbose){
			console.log("Save content to %s", path);
		}

		let fullpath = this.idToPath(path);
		if (this.policy.comply(fullpath, Operation.Write)) {
			const writeStream  = fs.createWriteStream(fullpath);
			data.pipe(writeStream);

			const done : Promise<void> = new Promise((res, rej) => {
				data.on("end", res);
				data.on("error", rej);
			});

			return done.then(() => this.pathToId(fullpath));
		}
		throw new Error("Access Denied");
	}

	async info(id) : Promise<IFsObject> {
		const fullpath = this.idToPath(id);
		if (!this.policy.comply(fullpath, Operation.Read)) {
			throw new Error("Access Denied");
		}

		const stat = await fs.lstat(fullpath);
		const name = filepath.basename(fullpath);
		const type = stat.isDirectory() ? "folder" : getFileType(name);
		const obj : IFsObject = {
			value:name,
			id,
			size:stat.size,
			date:stat.mtime.valueOf()/1000,
			type
		};

		return obj;
	}

	async make(path: string, name: string, isFolder: boolean, config?: IOperationConfig) : Promise<string> {
		if (this._config.verbose){
			console.log("Make entity %s %s", path, name);
		}

		let fullpath = this.idToPath(path);
		if (!this.policy.comply(fullpath, Operation.Write)) {
			throw new Error("Access Denied");
		}

		if(config && config.preventNameCollision){
			name = await this.checkName(fullpath, name, isFolder);
		}

		fullpath = filepath.join(fullpath, name)
		if (isFolder){
			await fs.ensureDir(fullpath);
		} else {
			await fs.writeFile(fullpath, "")
		}
		return this.pathToId(fullpath);
	}

	async copy(sourceId: string, targetId: string, name: string, config?: IOperationConfig): Promise<string> {
		if (this._config.verbose){
			console.log("Copy %s to %s", sourceId, targetId);
		}

		const source = this.idToPath(sourceId);
		let target = this.idToPath(targetId);

		if (!this.policy.comply(source, Operation.Read) || !this.policy.comply(target, Operation.Write)) {
			throw new Error("Access Denied");
		}

		if (!name) name = filepath.basename(source);
		if(config && config.preventNameCollision){
			const stat = await fs.lstat(source);
			name = await this.checkName(target, name, stat.isDirectory());
		}

		target = filepath.join(target, name);
		await fs.copy(source, target);
		return this.pathToId(target);
	}

	async exists(source: string): Promise<boolean> {
		source = this.idToPath(source);
		if (this.policy.comply(source, Operation.Read)){
			return fs.pathExists(source);
		}

		throw new Error("Access Denied");
	}

	async move(source: string, target: string, name: string, config?: IOperationConfig): Promise<string> {
		if (this._config.verbose){
			console.log("Move %s to %s", source, target);
		}

		source = this.idToPath(source);
		target = this.idToPath(target);

		if (!this.policy.comply(source, Operation.Write) ||
			!this.policy.comply(target, Operation.Write)) {
			throw new Error("Access Denied");
		}

		if (!name) name = filepath.basename(source);
		if(config && config.preventNameCollision){
			const stat = await fs.lstat(source);
			name = await this.checkName(target, name, stat.isDirectory());
		}

		target = filepath.join(target, name);
		await fs.move(source, target);
		return this.pathToId(target);
	}

	async stats(){
		// there is no simple way to detect free space with nodejs
		const used = 0, free = 0;
		return { used, free };
	}

	private idToPath(id: string): string {
		return filepath.normalize(filepath.join(this._root, id));
	}
	private pathToId(path: string): string {
		const id = path.replace(this._root, "");

		if (isWindows){
				return id.replace(/\\/g, "/");
		}
		return id;
	}

	private async _listFolder(
		path: string,
		prefix: string,
		cfg: IListConfig,
		list: IFsObject[]) : Promise<IFsObject[]> {

		const files = await fs.readdir(path);
		const res = (list && !cfg.nested) ? list : [];

		for (const name of files){
			if (name === ".") {
				continue;
			}

			const fullpath = filepath.join(this._root, prefix, name);
			const id = this.pathToId(fullpath);
			const stat = await fs.lstat(fullpath);
			const type = stat.isDirectory() ? "folder" : getFileType(name);
			const obj : IFsObject = { value:name, id, size:stat.size, date:stat.mtime.valueOf()/1000, type };

			if (cfg.exclude && cfg.exclude(obj)) {
				continue;
			}

			if (stat.isDirectory()) {
				if (cfg.subFolders) {
					const next = await this._listFolder(
						filepath.join(path, name),
						filepath.join(prefix, name),
						cfg,
						res
					);
					if (cfg.nested){
						obj.data = next;
					}
				}
			} else {
				if (cfg.skipFiles) {
					continue;
				}
			}

			if (cfg.include && !cfg.include(obj)){
				continue;
			}
			res.push(obj);
		}

		// folders first
		// sort files and folders by name
		if (list !== res){
			res.sort((a,b) => {
				if ((a.type === "folder" || b.type === "folder") && a.type !== b.type){
					return a.type === "folder" ? -1 : 1;
				}

				if (a.value !== b.value){
					return a.value.toUpperCase() > b.value.toUpperCase() ? 1 : -1;
				}
				return 0;
			});
		}

		return res;
	}

	private getNewName(name: string, counter: number, isFolder: boolean) : string {
		// filepath.extname grabs the characters after the last dot (app.css.gz return .gz, not .css.gz)
		const ext = !isFolder ? name.substring(name.indexOf(".")) : "";
		name = filepath.basename(name, ext);

		const match = name.match(/\(([0-9]*)\)$/);
		if (match) {
			name = name.substr(0, match.index);
			counter = Number(match[1])+1;
		}

		return name + "("+counter+")" + ext;
	}

	private async checkName(folder: string, name: string, isFolder: boolean) : Promise<string> {
		const files = await fs.readdir(folder);

		let counter = 1;

		while (files.indexOf(name) !== -1){
			name = this.getNewName(name, counter++, isFolder);
		}

		return name;
	}
}