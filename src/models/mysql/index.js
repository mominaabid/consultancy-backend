// src/models/mysql/index.js
import mysqlDb from "../../config/db.js";

// ✅ Base model with common methods
class BaseModel {
    constructor(table, hasSoftDelete = true) {
        this.table = table;
        this.hasSoftDelete = hasSoftDelete;
    }

    async findByPk(id, options = {}) {
        const attributes = options.attributes || '*';
        let sql = `SELECT ${attributes} FROM ${this.table} WHERE id = ?`;
        const params = [id];
        
        if (this.hasSoftDelete) {
            sql += ` AND is_deleted = 0`;
        }
        
        const [rows] = await mysqlDb.query(sql, params);
        return rows[0] || null;
    }

    async findOne(options = {}) {
        const where = options.where || {};
        const attributes = options.attributes || '*';
        const keys = Object.keys(where);
        
        let sql = `SELECT ${attributes} FROM ${this.table}`;
        const params = [];
        const conditions = [];
        
        if (this.hasSoftDelete) {
            conditions.push('is_deleted = 0');
        }
        
        if (keys.length > 0) {
            keys.forEach(key => {
                conditions.push(`${key} = ?`);
                params.push(where[key]);
            });
        }
        
        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        sql += ` LIMIT 1`;
        const [rows] = await mysqlDb.query(sql, params);
        return rows[0] || null;
    }

    async findAll(options = {}) {
        const where = options.where || {};
        const attributes = options.attributes || '*';
        const keys = Object.keys(where);
        
        let sql = `SELECT ${attributes} FROM ${this.table}`;
        const params = [];
        const conditions = [];
        
        if (this.hasSoftDelete) {
            conditions.push('is_deleted = 0');
        }
        
        if (keys.length > 0) {
            keys.forEach(key => {
                conditions.push(`${key} = ?`);
                params.push(where[key]);
            });
        }
        
        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        if (options.include) {
            const includes = Array.isArray(options.include) ? options.include : [options.include];
            includes.forEach(include => {
                if (include.association === 'lead' || include.model === 'Lead') {
                    sql += ` LEFT JOIN leads ON ${this.table}.lead_id = leads.id AND leads.is_deleted = 0`;
                }
                if (include.association === 'user' || include.model === 'User') {
                    sql += ` LEFT JOIN users ON ${this.table}.user_id = users.id AND users.is_deleted = 0`;
                }
                if (include.association === 'counsellor') {
                    sql += ` LEFT JOIN counsellors ON ${this.table}.counsellor_id = counsellors.id AND counsellors.is_deleted = 0`;
                }
            });
        }
        
        if (options.order) {
            const orderParts = options.order[0];
            sql += ` ORDER BY ${orderParts[0]} ${orderParts[1] || 'ASC'}`;
        }
        
        if (options.limit) {
            sql += ` LIMIT ${options.limit}`;
            if (options.offset) {
                sql += ` OFFSET ${options.offset}`;
            }
        }
        
        const [rows] = await mysqlDb.query(sql, params);
        return rows;
    }

    async create(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const [result] = await mysqlDb.query(sql, values);
        return { id: result.insertId, ...data };
    }

    async update(data, options = {}) {
        const where = options.where || {};
        const keys = Object.keys(where);
        const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
        let sql = `UPDATE ${this.table} SET ${setClause}`;
        const params = [...Object.values(data)];
        const conditions = [];
        
        if (this.hasSoftDelete) {
            conditions.push('is_deleted = 0');
        }
        
        if (keys.length > 0) {
            keys.forEach(key => {
                conditions.push(`${key} = ?`);
                params.push(where[key]);
            });
        }
        
        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        const [result] = await mysqlDb.query(sql, params);
        return result.affectedRows;
    }

    async destroy(options = {}) {
        const where = options.where || {};
        const keys = Object.keys(where);
        let sql = `DELETE FROM ${this.table}`;
        const params = [];
        const conditions = [];
        
        if (this.hasSoftDelete) {
            conditions.push('is_deleted = 0');
        }
        
        if (keys.length > 0) {
            keys.forEach(key => {
                conditions.push(`${key} = ?`);
                params.push(where[key]);
            });
        }
        
        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        const [result] = await mysqlDb.query(sql, params);
        return result.affectedRows;
    }
}

// ✅ Models WITH is_deleted column
export const User = new BaseModel('users', true);
export const Lead = new BaseModel('leads', true);
export const Counsellor = new BaseModel('counsellors', true);
export const Application = new BaseModel('applications', true);
export const Document = new BaseModel('student_documents', true);
export const LeadEducation = new BaseModel('lead_educations', true);
export const LeadActivityLog = new BaseModel('lead_activity_logs', true);

// ✅ Models WITHOUT is_deleted column
export const Notification = new BaseModel('notifications', false);
export const AccountTransaction = new BaseModel('student_accounts', false);
export const Payment = new BaseModel('student_accounts', false);
export const MobileDoc = new BaseModel('tbl_mobile_docs', false);
export const PasswordResetToken = new BaseModel('password_reset_tokens', false);

// ✅ Export as db
const db = {
    User,
    Lead,
    Counsellor,
    Application,
    Notification,
    LeadEducation,
    AccountTransaction,
    Document,
    Payment,
    MobileDoc,
    PasswordResetToken,
    LeadActivityLog,
    sequelize: null,
    Sequelize: null,
};

export default db;