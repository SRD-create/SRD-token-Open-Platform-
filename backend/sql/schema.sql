-- APIToken中转站数据库表结构

-- 角色表
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL COMMENT '角色名称：普通用户、代理商',
  `description` VARCHAR(255) COMMENT '角色描述',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- 代理商等级表
CREATE TABLE IF NOT EXISTS `agent_levels` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `level` INT NOT NULL COMMENT '等级：1、2、3',
  `commission_rate` DECIMAL(5,2) NOT NULL COMMENT '返佣比例：10.00、15.00、20.00',
  `price` DECIMAL(10,2) NOT NULL COMMENT '成为该等级代理商的费用',
  `description` VARCHAR(255) COMMENT '等级描述',
  `description_en` VARCHAR(255) COMMENT '英文描述',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='代理商等级表';

-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `wechat_openid` VARCHAR(100) UNIQUE COMMENT '微信OpenID',
  `wechat_unionid` VARCHAR(100) UNIQUE COMMENT '微信UnionID',
  `alipay_openid` VARCHAR(100) UNIQUE COMMENT '支付宝OpenID',
  `name` VARCHAR(100) COMMENT '用户名称',
  `email` VARCHAR(100) UNIQUE COMMENT '邮箱',
  `avatar` VARCHAR(255) COMMENT '头像',
  `role_id` INT DEFAULT 1 COMMENT '角色ID，默认普通用户',
  `agent_level_id` INT COMMENT '代理商等级ID，普通用户为NULL',
  `invite_code` VARCHAR(20) UNIQUE COMMENT '邀请码',
  `invited_by` INT COMMENT '邀请人ID',
  `last_login_at` DATETIME COMMENT '最后登录时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
  FOREIGN KEY (`agent_level_id`) REFERENCES `agent_levels`(`id`),
  FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 用户账户表
CREATE TABLE IF NOT EXISTS `user_accounts` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT UNIQUE NOT NULL COMMENT '用户ID',
  `balance` DECIMAL(10,2) DEFAULT 0.00 COMMENT '账户余额（只能用于使用模型）',
  `commission` DECIMAL(10,2) DEFAULT 0.00 COMMENT '佣金（可以提现）',
  `total_tokens` BIGINT DEFAULT 0 COMMENT '总token数',
  `used_tokens` BIGINT DEFAULT 0 COMMENT '已使用token数',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户账户表';

-- 提现记录表
CREATE TABLE IF NOT EXISTS `withdrawals` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '提现金额',
  `status` ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending' COMMENT '提现状态',
  `bank_account` VARCHAR(255) COMMENT '银行账户信息',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提现记录表';

-- 邀请记录表
CREATE TABLE IF NOT EXISTS `invites` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `inviter_id` INT NOT NULL COMMENT '邀请人ID',
  `invitee_id` INT NOT NULL COMMENT '被邀请人ID',
  `status` ENUM('pending', 'completed') DEFAULT 'pending' COMMENT '邀请状态',
  `reward_amount` DECIMAL(10,2) DEFAULT 0.00 COMMENT '奖励金额',
  `reward_status` ENUM('pending', 'issued') DEFAULT 'pending' COMMENT '奖励状态',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`),
  UNIQUE KEY `unique_invite` (`inviter_id`, `invitee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邀请记录表';

-- 套餐表
CREATE TABLE IF NOT EXISTS `packages` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '套餐名称',
  `name_en` VARCHAR(100) COMMENT '英文名称',
  `price` DECIMAL(10,2) NOT NULL COMMENT '套餐价格',
  `duration_days` INT NOT NULL COMMENT '套餐时长（天）',
  `rpm` INT NOT NULL COMMENT '每分钟请求数限制',
  `tpm` INT NOT NULL COMMENT '每分钟token数限制',
  `is_all_models` BOOLEAN DEFAULT FALSE COMMENT '是否可使用所有模型',
  `package_type` VARCHAR(50) COMMENT '套餐类型',
  `description` VARCHAR(255) COMMENT '套餐描述',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐表';



-- 订单表
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `order_no` VARCHAR(50) UNIQUE NOT NULL COMMENT '订单号',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '订单金额',
  `order_type` ENUM('recharge', 'package') NOT NULL COMMENT '订单类型：充值、套餐',
  `package_id` INT COMMENT '套餐ID，充值订单为NULL',
  `payment_method` ENUM('wechat', 'alipay') NOT NULL COMMENT '支付方式',
  `status` ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending' COMMENT '订单状态',
  `transaction_id` VARCHAR(100) COMMENT '支付交易ID',
  `agent_commission` DECIMAL(10,2) DEFAULT 0.00 COMMENT '代理商返佣金额',
  `agent_id` INT COMMENT '代理商ID',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`),
  FOREIGN KEY (`agent_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- 支付记录表
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `order_id` INT NOT NULL COMMENT '订单ID',
  `payment_method` ENUM('wechat', 'alipay') NOT NULL COMMENT '支付方式',
  `transaction_id` VARCHAR(100) UNIQUE NOT NULL COMMENT '交易ID',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '支付金额',
  `status` ENUM('pending', 'success', 'failed') DEFAULT 'pending' COMMENT '支付状态',
  `callback_data` TEXT COMMENT '回调数据',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付记录表';

-- 用户套餐表
CREATE TABLE IF NOT EXISTS `user_packages` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `package_id` INT NOT NULL COMMENT '套餐ID',
  `order_id` INT NOT NULL COMMENT '订单ID',
  `start_at` DATETIME NOT NULL COMMENT '开始时间',
  `end_at` DATETIME NOT NULL COMMENT '结束时间',
  `status` ENUM('active', 'expired') DEFAULT 'active' COMMENT '套餐状态',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`),
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户套餐表';

-- Token使用记录表
CREATE TABLE IF NOT EXISTS `token_usage` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `request_id` VARCHAR(64) COMMENT '请求ID',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `api_key_id` INT COMMENT 'API密钥ID',
  `api_key` VARCHAR(255) COMMENT 'API密钥',
  `model_name` VARCHAR(100) NOT NULL COMMENT '模型名称',
  `prompt_tokens` INT NOT NULL COMMENT '输入Token数',
  `completion_tokens` INT NOT NULL COMMENT '输出Token数',
  `total_tokens` INT NOT NULL COMMENT '总Token数',
  `request_time` DATETIME COMMENT '请求时间',
  `response_time` FLOAT COMMENT '响应时间（秒）',
  `status` VARCHAR(20) COMMENT '状态 (success, error)',
  `error_message` TEXT COMMENT '错误信息',
  `input_token_price` FLOAT COMMENT '输入Token单价',
  `output_token_price` FLOAT COMMENT '输出Token单价',
  `cost` DECIMAL(10,4) NOT NULL COMMENT '费用',
  `endpoint` VARCHAR(255) COMMENT '调用的API端点',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Token使用记录表';

-- 余额交易记录表
CREATE TABLE IF NOT EXISTS `balance_transactions` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `account_type` ENUM('balance', 'commission') NOT NULL COMMENT '账户类型：余额、佣金',
  `type` ENUM('recharge', 'usage', 'reward', 'commission', 'withdrawal') NOT NULL COMMENT '交易类型：充值、使用、奖励、佣金、提现',
  `amount` DECIMAL(10,2) NOT NULL COMMENT '交易金额',
  `balance_before` DECIMAL(10,2) NOT NULL COMMENT '交易前余额',
  `balance_after` DECIMAL(10,2) NOT NULL COMMENT '交易后余额',
  `related_id` INT COMMENT '关联ID（如订单ID、token使用记录ID、提现ID）',
  `description` VARCHAR(255) COMMENT '交易描述',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='余额交易记录表';

-- API密钥表
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '用户ID',
  `name` VARCHAR(100) NOT NULL COMMENT '密钥名称',
  `key` VARCHAR(255) UNIQUE NOT NULL COMMENT 'API密钥',
  `status` ENUM('active', 'inactive') DEFAULT 'active' COMMENT '密钥状态',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  INDEX `idx_user_id_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API密钥表';


-- 套餐模型关联表
CREATE TABLE IF NOT EXISTS `package_models` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `package_id` INT NOT NULL COMMENT '套餐ID',
  `model_id` INT NOT NULL COMMENT '模型ID',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`),
  FOREIGN KEY (`model_id`) REFERENCES `models`(`id`),
  UNIQUE KEY `unique_package_model` (`package_id`, `model_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐模型关联表';



-- 初始化数据

-- 角色数据
INSERT INTO `roles` (`name`, `description`) VALUES
('普通用户', '普通C端用户'),
('代理商', '代理商用户');

-- 代理商等级数据
INSERT INTO `agent_levels` (`level`, `commission_rate`, `price`, `description`, `description_en`) VALUES
(1, 20.00, 999.00, '1级代理商，返佣20%', 'Level 1 Agent, 20% commission'),
(2, 15.00, 1999.00, '2级代理商，返佣15%', 'Level 2 Agent, 15% commission'),
(3, 10.00, 2999.00, '3级代理商，返佣10%', 'Level 3 Agent, 10% commission');

-- 套餐数据
INSERT INTO `packages` (`name`, `name_en`, `price`, `duration_days`, `rpm`, `tpm`, `is_all_models`, `package_type`, `description`) VALUES
('pro套餐', 'Pro Plan', 99.00, 30, 30, 10000, FALSE, 'personal', '基础套餐，适合个人使用'),
('max套餐', 'Max Plan', 199.00, 30, 60, 100000, FALSE, 'business', '专业套餐，适合企业使用'),
('ultra套餐', 'Ultra Plan', 399.00, 30, 60, 100000, TRUE, 'enterprise', '专业套餐，适合企业使用');

