const Invoice = require('../models/Invoice');
const Contract = require('../models/Contract');

/**
 * Analytics Controller
 * Provides business insights and metrics for dashboard
 */

/**
 * Get overview statistics
 * Total revenue, pending amount, invoice count, etc.
 */
exports.getOverview = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get all invoices for user
    const invoices = await Invoice.find({ userId });

    // Calculate metrics
    const totalRevenue = invoices
      .filter(inv => inv.paymentStatus === 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const pendingAmount = invoices
      .filter(inv => inv.paymentStatus === 'pending')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const overdueAmount = invoices
      .filter(inv => {
        if (inv.paymentStatus !== 'pending') return false;
        const dueDate = new Date(inv.dueDate);
        return dueDate < new Date();
      })
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const totalInvoices = invoices.length;
    const paidInvoices = invoices.filter(inv => inv.paymentStatus === 'paid').length;
    const pendingInvoices = invoices.filter(inv => inv.paymentStatus === 'pending').length;
    const overdueInvoices = invoices.filter(inv => {
      if (inv.paymentStatus !== 'pending') return false;
      const dueDate = new Date(inv.dueDate);
      return dueDate < new Date();
    }).length;

    // Get contract count
    const totalContracts = await Contract.countDocuments({ userId });

    res.json({
      overview: {
        totalRevenue: totalRevenue.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        overdueAmount: overdueAmount.toFixed(2),
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        overdueInvoices,
        totalContracts
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get revenue trends over time
 * Returns monthly revenue for the last 12 months
 */
exports.getRevenueTrends = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get invoices from last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const invoices = await Invoice.find({
      userId,
      paymentStatus: 'paid',
      paymentDate: { $gte: twelveMonthsAgo }
    });

    // Group by month
    const monthlyRevenue = {};
    for (let i = 0; i < 12; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = 0;
    }

    invoices.forEach(invoice => {
      const date = new Date(invoice.paymentDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyRevenue[key] !== undefined) {
        monthlyRevenue[key] += invoice.total || 0;
      }
    });

    // Convert to array and sort
    const trends = Object.keys(monthlyRevenue)
      .sort()
      .map(month => ({
        month,
        revenue: monthlyRevenue[month].toFixed(2)
      }));

    res.json({ trends });
  } catch (error) {
    next(error);
  }
};

/**
 * Get top clients by revenue
 */
exports.getTopClients = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const invoices = await Invoice.find({ userId });

    // Group by client
    const clientRevenue = {};
    invoices.forEach(invoice => {
      const clientName = invoice.to?.name || 'Unknown Client';
      if (!clientRevenue[clientName]) {
        clientRevenue[clientName] = {
          name: clientName,
          email: invoice.to?.email || '',
          totalRevenue: 0,
          invoiceCount: 0,
          paidAmount: 0,
          pendingAmount: 0
        };
      }
      clientRevenue[clientName].totalRevenue += invoice.total || 0;
      clientRevenue[clientName].invoiceCount++;
      
      if (invoice.paymentStatus === 'paid') {
        clientRevenue[clientName].paidAmount += invoice.total || 0;
      } else if (invoice.paymentStatus === 'pending') {
        clientRevenue[clientName].pendingAmount += invoice.total || 0;
      }
    });

    // Convert to array and sort by total revenue
    const topClients = Object.values(clientRevenue)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit)
      .map(client => ({
        ...client,
        totalRevenue: client.totalRevenue.toFixed(2),
        paidAmount: client.paidAmount.toFixed(2),
        pendingAmount: client.pendingAmount.toFixed(2)
      }));

    res.json({ topClients });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment status breakdown
 */
exports.getPaymentStatusBreakdown = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const invoices = await Invoice.find({ userId });

    const breakdown = {
      paid: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 }
    };

    invoices.forEach(invoice => {
      let status = invoice.paymentStatus;
      
      // Check if pending invoice is overdue
      if (status === 'pending' && invoice.dueDate) {
        const dueDate = new Date(invoice.dueDate);
        if (dueDate < new Date()) {
          status = 'overdue';
        }
      }

      if (breakdown[status]) {
        breakdown[status].count++;
        breakdown[status].amount += invoice.total || 0;
      }
    });

    // Format amounts
    Object.keys(breakdown).forEach(key => {
      breakdown[key].amount = breakdown[key].amount.toFixed(2);
    });

    res.json({ breakdown });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent activity
 * Returns recent invoices and contracts
 */
exports.getRecentActivity = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    // Get recent invoices
    const recentInvoices = await Invoice.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('invoiceNumber date total paymentStatus to createdAt');

    // Get recent contracts
    const recentContracts = await Contract.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title parties createdAt');

    // Combine and sort by date
    const activity = [
      ...recentInvoices.map(inv => ({
        type: 'invoice',
        id: inv._id,
        title: `Invoice ${inv.invoiceNumber}`,
        subtitle: inv.to?.name || 'Unknown Client',
        amount: inv.total,
        status: inv.paymentStatus,
        date: inv.createdAt
      })),
      ...recentContracts.map(contract => ({
        type: 'contract',
        id: contract._id,
        title: contract.title,
        subtitle: contract.parties?.client?.name || 'Unknown Client',
        date: contract.createdAt
      }))
    ]
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);

    res.json({ activity });
  } catch (error) {
    next(error);
  }
};

/**
 * Get currency breakdown
 * Shows revenue by currency
 */
exports.getCurrencyBreakdown = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const invoices = await Invoice.find({ userId });

    const currencyTotals = {};
    invoices.forEach(invoice => {
      const currency = invoice.currency || 'USD';
      if (!currencyTotals[currency]) {
        currencyTotals[currency] = {
          currency,
          total: 0,
          paid: 0,
          pending: 0,
          count: 0
        };
      }
      currencyTotals[currency].total += invoice.total || 0;
      currencyTotals[currency].count++;
      
      if (invoice.paymentStatus === 'paid') {
        currencyTotals[currency].paid += invoice.total || 0;
      } else if (invoice.paymentStatus === 'pending') {
        currencyTotals[currency].pending += invoice.total || 0;
      }
    });

    const breakdown = Object.values(currencyTotals).map(item => ({
      ...item,
      total: item.total.toFixed(2),
      paid: item.paid.toFixed(2),
      pending: item.pending.toFixed(2)
    }));

    res.json({ currencyBreakdown: breakdown });
  } catch (error) {
    next(error);
  }
};
