/**
 * GraphQL API 客户端
 * 用于与后端 GraphQL 接口交互
 */

import { API_BASE_URL } from "@/utils/config";

// GraphQL 请求配置
interface GraphQLRequestConfig {
  query: string;
  variables?: Record<string, any>;
}

// GraphQL 响应类型
interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL 客户端类
 */
class GraphQLClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取默认请求头
   */
  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 如果有 token，添加到请求头
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * 发送 GraphQL 请求
   */
  async request<T = any>(
    config: GraphQLRequestConfig,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        query: config.query,
        variables: config.variables,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message);
    }

    if (result.data === undefined || result.data === null) {
      throw new Error("GraphQL 响应中缺少 data 字段");
    }

    return result.data;
  }
}

// 导出 GraphQL 客户端实例
export const graphqlClient = new GraphQLClient();

// ──────────────────────────────────────────────
// 用户相关类型
// ──────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
}

export interface RegisterPayload {
  register: {
    success: boolean;
    message: string;
    token: string | null;
    user: {
      id: number;
      email: string;
      phone: string | null;
      createdAt: string | null;
    } | null;
  };
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginPayload {
  login: {
    success: boolean;
    message: string;
    token: string | null;
    user: {
      id: number;
      email: string;
      phone: string | null;
      createdAt: string | null;
    } | null;
  };
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ForgotPasswordPayload {
  forgotPassword: {
    success: boolean;
    message: string;
    resetToken: string | null;
  };
}

export interface LogoutPayload {
  logout: {
    success: boolean;
    message: string;
    token: null;
    user: null;
  };
}

// ──────────────────────────────────────────────
// 数据导入相关类型
// ──────────────────────────────────────────────

export interface FieldInfo {
  name: string;
  dtype: string;
  sampleValues: string[];
}

export interface FileUploadResultPayload {
  parseFile: {
    success: boolean;
    message: string;
    fields: FieldInfo[];
  };
}

export interface FieldDef {
  name: string;
  dtype: string;
  comment: string;
}

export interface CreateTableInputType {
  tableName: string;
  tableComment: string;
  fields: FieldDef[];
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  fileData?: string;
  uploadId?: string;
  filename: string;
}

export interface ChunkUploadResultPayload {
  uploadFileChunk: {
    success: boolean;
    message: string;
    receivedIndex: number;
  };
}

export interface CreateTableResultPayload {
  createTableAndImport: {
    success: boolean;
    message: string;
    sql: string;
    rowsImported: number;
  };
}

export interface SubmitImportJobPayload {
  submitImportJob: {
    success: boolean;
    message: string;
    jobId: string | null;
  };
}

export interface ImportJobStatusPayload {
  importJobStatus: {
    jobId: string;
    status: string; // pending | running | success | failed
    message: string;
    rowsImported: number;
    sql: string;
    createdAt: string;
    finishedAt: string | null;
  };
}

export interface DbConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  isDefault: boolean;
}

export interface GetDbConfigPayload {
  getDbConfig: DbConfig | null;
}

// ──────────────────────────────────────────────
// 用户 GraphQL API
// ──────────────────────────────────────────────

export const userGraphqlApi = {
  /**
   * 用户注册
   */
  register: async (input: RegisterInput): Promise<RegisterPayload> => {
    const mutation = `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          success
          message
          token
          user {
            id
            email
            phone
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<RegisterPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 用户登录
   */
  login: async (input: LoginInput): Promise<LoginPayload> => {
    const mutation = `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          success
          message
          token
          user {
            id
            email
            phone
            createdAt
          }
        }
      }
    `;

    return graphqlClient.request<LoginPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 忘记密码
   */
  forgotPassword: async (
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordPayload> => {
    const mutation = `
      mutation ForgotPassword($input: ForgotPasswordInput!) {
        forgotPassword(input: $input) {
          success
          message
          resetToken
        }
      }
    `;

    return graphqlClient.request<ForgotPasswordPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 用户登出
   */
  logout: async (): Promise<LogoutPayload> => {
    const mutation = `
      mutation Logout {
        logout {
          success
          message
          token
          user {
            id
          }
        }
      }
    `;

    return graphqlClient.request<LogoutPayload>({
      query: mutation,
    });
  },
};

// ──────────────────────────────────────────────
// 数据导入 GraphQL API
// ──────────────────────────────────────────────

export const dataGraphqlApi = {
  /**
   * 获取默认数据库连接配置
   */
  getDbConfig: async (): Promise<GetDbConfigPayload> => {
    const query = `
      query GetDbConfig {
        getDbConfig {
          id
          name
          host
          port
          username
          password
          database
          isDefault
        }
      }
    `;

    return graphqlClient.request<GetDbConfigPayload>({
      query,
    });
  },

  /**
   * 解析上传的文件
   */
  parseFile: async (
    fileData: string,
    filename: string,
  ): Promise<FileUploadResultPayload> => {
    const mutation = `
      mutation ParseFile($fileData: String!, $filename: String!) {
        parseFile(fileData: $fileData, filename: $filename) {
          success
          message
          fields {
            name
            dtype
            sampleValues
          }
        }
      }
    `;

    return graphqlClient.request<FileUploadResultPayload>({
      query: mutation,
      variables: { fileData, filename },
    });
  },

  /**
   * 上传文件分片（大文件分片上传）
   */
  uploadFileChunk: async (
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkData: string,
    filename: string,
  ): Promise<ChunkUploadResultPayload> => {
    const mutation = `
      mutation UploadFileChunk($uploadId: String!, $chunkIndex: Int!, $totalChunks: Int!, $chunkData: String!, $filename: String!) {
        uploadFileChunk(uploadId: $uploadId, chunkIndex: $chunkIndex, totalChunks: $totalChunks, chunkData: $chunkData, filename: $filename) {
          success
          message
          receivedIndex
        }
      }
    `;

    return graphqlClient.request<ChunkUploadResultPayload>({
      query: mutation,
      variables: { uploadId, chunkIndex, totalChunks, chunkData, filename },
    });
  },

  /**
   * 创建表并导入数据
   */
  createTableAndImport: async (
    input: CreateTableInputType,
  ): Promise<CreateTableResultPayload> => {
    const mutation = `
      mutation CreateTableAndImport($input: CreateTableInput!) {
        createTableAndImport(input: $input) {
          success
          message
          sql
          rowsImported
        }
      }
    `;

    return graphqlClient.request<CreateTableResultPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 提交后台建表导入任务（大文件推荐：立即返回 jobId，避免网关超时）
   */
  submitImportJob: async (
    input: CreateTableInputType,
  ): Promise<SubmitImportJobPayload> => {
    const mutation = `
      mutation SubmitImportJob($input: CreateTableInput!) {
        submitImportJob(input: $input) {
          success
          message
          jobId
        }
      }
    `;

    return graphqlClient.request<SubmitImportJobPayload>({
      query: mutation,
      variables: { input },
    });
  },

  /**
   * 查询后台导入任务状态
   */
  importJobStatus: async (jobId: string): Promise<ImportJobStatusPayload> => {
    const query = `
      query ImportJobStatus($jobId: String!) {
        importJobStatus(jobId: $jobId) {
          jobId
          status
          message
          rowsImported
          sql
          createdAt
          finishedAt
        }
      }
    `;

    return graphqlClient.request<ImportJobStatusPayload>({
      query,
      variables: { jobId },
    });
  },
};
