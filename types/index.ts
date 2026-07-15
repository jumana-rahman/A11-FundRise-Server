import { ObjectId } from "mongodb";

export type UserRole = "supporter" | "creator" | "admin";
export type CampaignStatus = "pending" | "approved" | "rejected";
export type ContributionStatus = "pending" | "approved" | "rejected";
export type WithdrawalStatus = "pending" | "approved" | "rejected";

export interface User {
  _id?: ObjectId | string;
  id?: string;
  name: string;
  email: string;
  photoUrl: string;
  role: UserRole;
  credits: number;
  createdAt?: Date;
}

export interface Campaign {
  _id?: ObjectId | string;
  id?: string;
  campaignTitle: string;
  campaignStory: string;
  category: string;
  fundingGoal: number;
  minimumContribution: number;
  deadline: string;
  rewardInfo: string;
  campaignImageUrl: string;
  creatorEmail: string;
  creatorName: string;
  amountRaised: number;
  status: CampaignStatus;
  createdAt?: Date;
}

export interface Contribution {
  _id?: ObjectId | string;
  id?: string;
  campaignId: string;
  campaignTitle: string;
  contributionAmount: number;
  supporterEmail: string;
  supporterName: string;
  creatorEmail: string;
  creatorName: string;
  currentDate: string;
  status: ContributionStatus;
}

export interface Withdrawal {
  _id?: ObjectId | string;
  id?: string;
  creatorEmail: string;
  creatorName: string;
  withdrawalCredit: number;
  withdrawalAmount: number;
  paymentSystem: string;
  accountNumber: string;
  withdrawDate: string;
  status: WithdrawalStatus;
}

export interface Notification {
  _id?: ObjectId | string;
  id?: string;
  message: string;
  toEmail: string;
  actionRoute: string;
  time: Date;
  read: boolean;
}

export interface Report {
  _id?: ObjectId | string;
  id?: string;
  campaignId: string;
  campaignTitle: string;
  reporterName: string;
  reporterEmail: string;
  reason: string;
  date: string;
  status: "open" | "resolved";
}

export interface Payment {
  _id?: ObjectId | string;
  id?: string;
  userEmail: string;
  userName: string;
  credits: number;
  amount: number;
  method: string;
  date: string;
  status: "completed" | "failed" | "pending";
  stripeSessionId?: string;
}

export interface JWTPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  credits: number;
  photoUrl: string;
}
